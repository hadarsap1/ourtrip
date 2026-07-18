-- Sprint 8: web push subscriptions, notification triggers, weekly backup.

-- ============ PUSH SUBSCRIPTIONS ============

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

-- every member manages only their own device subscriptions
create policy push_subscriptions_self_all on push_subscriptions
  for all using (member_id = public.current_member_id())
  with check (member_id = public.current_member_id());

-- ============ NOTIFICATION TRIGGERS (via pg_net → push-send) ============
-- push-send loads all content server-side from the id it is given, so a
-- forged call can at most re-notify legitimate content (accepted risk,
-- SECURITY-CHECKS.md).

create or replace function public.notify_wall_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://xeqfcrxrpfjlqhkijrwd.supabase.co/functions/v1/push-send',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('type', 'wall-message', 'message_id', new.id)
  );
  return new;
end;
$$;

revoke execute on function public.notify_wall_message() from public, anon, authenticated;

create trigger messages_notify
  after insert on messages
  for each row execute function public.notify_wall_message();

create or replace function public.notify_pending_photo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending' then
    perform net.http_post(
      url := 'https://xeqfcrxrpfjlqhkijrwd.supabase.co/functions/v1/push-send',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object('type', 'pending-photo', 'photo_id', new.id)
    );
  end if;
  return new;
end;
$$;

revoke execute on function public.notify_pending_photo() from public, anon, authenticated;

create trigger photos_notify_pending
  after insert on photos
  for each row execute function public.notify_pending_photo();

-- ============ SCHEDULES ============

-- daily push digest: weather alert + flight check-in reminder (05:00 UTC,
-- after fx-daily)
select cron.unschedule('push-daily')
where exists (select 1 from cron.job where jobname = 'push-daily');

select cron.schedule(
  'push-daily',
  '0 5 * * *',
  $$
  select net.http_post(
    url := 'https://xeqfcrxrpfjlqhkijrwd.supabase.co/functions/v1/push-send',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"type": "daily"}'::jsonb
  );
  $$
);

-- weekly backup (Sunday 03:00 UTC) — never cut (ROADMAP cut order)
select cron.unschedule('backup-weekly')
where exists (select 1 from cron.job where jobname = 'backup-weekly');

select cron.schedule(
  'backup-weekly',
  '0 3 * * 0',
  $$
  select net.http_post(
    url := 'https://xeqfcrxrpfjlqhkijrwd.supabase.co/functions/v1/backup-weekly',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- ============ STORAGE: backups (service-role writes, owner reads) ============

insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;

create policy backups_owner_select on storage.objects
  for select using (
    bucket_id = 'backups' and public.current_member_role() = 'owner'
  );
