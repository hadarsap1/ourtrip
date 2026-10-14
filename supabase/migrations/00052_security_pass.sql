-- Security pass 14/10/2026 (docs/SECURITY-CHECKS.md, "Full security pass").
--
-- 1. PHOTOS: a kid cannot swap the file behind a photo. photos_kid_update_own
--    lets a kid edit their own photo (caption), and photos_guard_update froze
--    status / sharing / approval only - so after a parent approved and shared
--    a kid's photo, the kid could point file_path at any other object in the
--    bucket (a pending, rejected or never-shared photo), and guest-photos
--    would sign that object for every guest. Hard rule #3 has to hold in the
--    database; episodes_guard (00044) already froze file_path, photos now too.
--
-- 2. CRON SECRET, ON FOR REAL. 00025 built a shared secret for the functions
--    pg_cron / pg_net call with verify_jwt = false (push-send, backup-weekly,
--    fx-daily), but it failed OPEN until someone set it on both sides, and
--    nobody had: anyone with the project URL could push notifications to the
--    family at 3am or fill the backups bucket. Now the database generates the
--    secret itself and keeps it in a table no API role can read, the jobs
--    send it, and the functions ask the database whether a header matches
--    (cron_secret_matches, service role only) and refuse otherwise. The value
--    never passes through a file, a chat or a dashboard.

-- ============ 1. PHOTOS ============

create or replace function public.photos_guard_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.current_member_role() = 'kid' then
    new.status := old.status;
    new.shared_with_guests := old.shared_with_guests;
    new.approved_by := old.approved_by;
    -- the file and its ownership are not the kid's to change (00052)
    new.file_path := old.file_path;
    new.trip_id := old.trip_id;
    new.uploaded_by := old.uploaded_by;
  end if;
  return new;
end;
$$;

revoke execute on function public.photos_guard_update() from public, anon, authenticated;

-- ============ 2. CRON SECRET ============

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.app_secrets (
  name text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
alter table private.app_secrets enable row level security;  -- no policies: owner only
revoke all on private.app_secrets from public, anon, authenticated;

-- 64 hex characters from two random UUIDs (~244 random bits); generated here
insert into private.app_secrets (name, value)
values ('cron_secret', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (name) do nothing;

create or replace function public.cron_secret_header()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-secret', coalesce(
      (select s.value from private.app_secrets s where s.name = 'cron_secret'),
      current_setting('app.settings.cron_secret', true),
      ''
    )
  );
$$;
revoke execute on function public.cron_secret_header() from public, anon, authenticated;

create or replace function public.cron_secret_matches(p_secret text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(p_secret, '') <> ''
     and p_secret = (select s.value from private.app_secrets s where s.name = 'cron_secret');
$$;
revoke execute on function public.cron_secret_matches(text) from public, anon, authenticated;
grant execute on function public.cron_secret_matches(text) to service_role;

-- ============ 3. ADVISOR ============
-- function_search_path_mutable (Supabase lint 0011): pin it like every other
-- function here.
alter function public.visa_requirements_touch_updated_at() set search_path = public;
