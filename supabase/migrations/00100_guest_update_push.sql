-- Push to guests on a new update or podcast episode (Hadar 19/11/2026,
-- DECISIONS #71). A guest turns it on per device, on their home or in
-- settings; turned on = the device has a push_subscriptions row (self-scoped,
-- 00010). Guests get nothing else by push: not the wall, not the dailies.
--
-- Who is told is decided in push-send with the service role, by the same rule
-- as the guest policies, so a push never names something the guest cannot open:
--   story   - posts_guest_select (00063): approved, visibility guests/public,
--             past publish_after, audience '{}' or one of the guest's groups
--   episode - episodes_guest_select (00059): approved AND shared_with_guests
--
-- Each item is told once: push-send claims it in guest_update_pushes (insert,
-- on conflict nothing) before sending, so the trigger call and the sweep never
-- both send it. The 15-minute sweep sends what the trigger could not: a story
-- whose publish_after just passed, and what was published during quiet hours
-- (22:00-07:00 Israel time - the guests are at home) goes out at 07:00.
--
-- Rollback: docs/upgrade/migrations/00100_guest_update_push.down.sql.

create table guest_update_pushes (
  -- a posts.id or an episodes.id (both uuids, never the same value)
  target_id uuid primary key,
  kind text not null default 'story' check (kind in ('story', 'episode')),
  trip_id uuid not null references trips(id),
  sent_at timestamptz not null default now()
);

comment on table guest_update_pushes is
  'Updates and episodes guests were already told about by push (00100). '
  'Service role only: RLS on, no policies.';

create index idx_guest_update_pushes_trip_id on guest_update_pushes(trip_id);

alter table guest_update_pushes enable row level security;
-- no policy on purpose: only push-send (service role) reads and writes it
revoke all on guest_update_pushes from anon, authenticated;

-- what guests can already see is not news: never push it
insert into guest_update_pushes (target_id, kind, trip_id)
select id, 'story', trip_id from posts
 where status = 'approved'
   and visibility in ('guests', 'public')
   and (publish_after is null or publish_after <= now())
on conflict do nothing;

insert into guest_update_pushes (target_id, kind, trip_id)
select id, 'episode', trip_id from episodes
 where status = 'approved' and shared_with_guests
on conflict do nothing;

-- ============ triggers: ask push-send to look, right away ============
-- The body carries no id: push-send reads every item guests may see and not
-- yet told, so a forged call can at most send a due push a little earlier.

create or replace function public.notify_guest_updates()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := public.functions_base_url() || '/push-send',
    headers := public.cron_secret_header(),
    body := '{"type": "guest-updates"}'::jsonb
  );
  return new;
end;
$$;

revoke execute on function public.notify_guest_updates() from public, anon, authenticated;

create trigger posts_notify_guests
  after insert or update of status, visibility, publish_after on posts
  for each row
  when (new.status = 'approved' and new.visibility in ('guests', 'public'))
  execute function public.notify_guest_updates();

create trigger episodes_notify_guests
  after insert or update of status, shared_with_guests on episodes
  for each row
  when (new.status = 'approved' and new.shared_with_guests)
  execute function public.notify_guest_updates();

-- ============ sweep: scheduled stories and the morning after quiet hours ============

select cron.schedule(
  'push-guest-updates',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := public.functions_base_url() || '/push-send',
    headers := public.cron_secret_header(),
    body := '{"type": "guest-updates"}'::jsonb
  );
  $job$
);
