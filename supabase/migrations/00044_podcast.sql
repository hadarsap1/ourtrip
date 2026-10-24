-- Sharing, phase 2 (docs/DESIGN-sharing.md §2): the kids' podcast.
--
-- An episode is one audio recording with a title. It follows the photo rules
-- exactly (DECISIONS #4/#5), because it is a child's voice:
--
--   * a kid's recording always lands pending and unshared, whatever the
--     client sends (episodes_enforce_kid_rules on insert, episodes_guard on
--     update - same shape as photos_enforce_kid_rules / photos_guard_update)
--   * a guest hears it only when status = 'approved' AND
--     shared_with_guests = true - two separate parent actions
--   * never public: there is no anon policy and the bucket is private
--
-- Audio lives in the private `audio` bucket. Family members read and upload
-- it directly; guests never touch the bucket and get short-lived signed URLs
-- from the guest-media Edge Function, which lists episodes under the
-- caller's own RLS first (same pattern as guest-photos).

create table episodes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  recorded_by uuid not null references members(id),
  title text not null check (char_length(title) between 1 and 120),
  description text check (description is null or char_length(description) <= 2000),
  file_path text not null,
  mime_type text not null default 'audio/webm',
  duration_seconds int check (duration_seconds is null or duration_seconds between 0 and 3600),
  day_id uuid references itinerary_days(id) on delete set null,
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  cover_photo_id uuid references photos(id) on delete set null,
  status photo_status not null default 'pending',
  shared_with_guests boolean not null default false,
  approved_by uuid references members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table episodes is
  'Podcast episodes. Guest-audible only when approved AND shared_with_guests '
  '(migration 00044, DECISIONS #4/#5). Never public.';

create index idx_episodes_trip_created on episodes(trip_id, created_at desc);
create index idx_episodes_recorded_by on episodes(recorded_by);
create index idx_episodes_day_id on episodes(day_id);
create index idx_episodes_cover_photo_id on episodes(cover_photo_id);
create index idx_episodes_approved_by on episodes(approved_by);

create trigger episodes_set_updated_at
  before update on episodes
  for each row execute function public.set_updated_at();

-- ============ KID RULES ============

create or replace function public.episodes_enforce_kid_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare recorder_role member_role;
begin
  select role into recorder_role from members where id = new.recorded_by;
  if recorder_role = 'kid' or public.current_member_role() = 'kid' then
    new.status := 'pending';
    new.shared_with_guests := false;
    new.approved_by := null;
  end if;
  return new;
end;
$$;

create trigger episodes_before_insert
  before insert on episodes
  for each row execute function public.episodes_enforce_kid_rules();

create or replace function public.episodes_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.current_member_role() = 'kid' then
    new.status := old.status;
    new.shared_with_guests := old.shared_with_guests;
    new.approved_by := old.approved_by;
    new.recorded_by := old.recorded_by;
    new.trip_id := old.trip_id;
    new.file_path := old.file_path;
  end if;
  -- withdrawing approval also withdraws sharing, so re-approving later is
  -- never a silent re-share
  if new.status <> 'approved' then
    new.shared_with_guests := false;
  end if;
  return new;
end;
$$;

create trigger episodes_before_update
  before update on episodes
  for each row execute function public.episodes_guard();

revoke execute on function public.episodes_enforce_kid_rules() from public, anon, authenticated;
revoke execute on function public.episodes_guard() from public, anon, authenticated;

-- ============ RLS ============

alter table episodes enable row level security;

create policy episodes_owner_all on episodes
  for all using (public.is_owner_of(trip_id))
  with check (public.is_owner_of(trip_id));

-- kids hear every approved episode and their own (pending ones included)
create policy episodes_kid_select on episodes
  for select using (
    public.is_kid_of(trip_id)
    and (status = 'approved' or recorded_by = public.current_member_id())
  );

create policy episodes_kid_insert on episodes
  for insert with check (
    public.is_kid_of(trip_id) and recorded_by = public.current_member_id()
  );

-- title / description of their own recording while it waits for approval
create policy episodes_kid_update on episodes
  for update using (
    public.is_kid_of(trip_id)
    and recorded_by = public.current_member_id()
    and status = 'pending'
  ) with check (
    public.is_kid_of(trip_id) and recorded_by = public.current_member_id()
  );

create policy episodes_kid_delete on episodes
  for delete using (
    public.is_kid_of(trip_id)
    and recorded_by = public.current_member_id()
    and status = 'pending'
  );

create policy episodes_guest_select on episodes
  for select using (
    public.is_active_guest_of(trip_id)
    and status = 'approved'
    and shared_with_guests = true
  );

-- ============ STORAGE: audio (family only) ============

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audio',
  'audio',
  false,
  26214400, -- 25 MB: a 7-minute cap at voice bitrates is ~2-4 MB
  array['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/aac', 'audio/x-m4a']
)
on conflict (id) do nothing;

create policy audio_bucket_family_select on storage.objects
  for select using (
    bucket_id = 'audio' and public.current_member_role() in ('owner', 'kid')
  );

create policy audio_bucket_family_insert on storage.objects
  for insert with check (
    bucket_id = 'audio' and public.current_member_role() in ('owner', 'kid')
  );

create policy audio_bucket_owner_update on storage.objects
  for update using (
    bucket_id = 'audio' and public.current_member_role() = 'owner'
  ) with check (
    bucket_id = 'audio' and public.current_member_role() = 'owner'
  );

create policy audio_bucket_owner_delete on storage.objects
  for delete using (
    bucket_id = 'audio' and public.current_member_role() = 'owner'
  );
