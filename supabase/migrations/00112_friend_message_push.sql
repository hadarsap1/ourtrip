-- A new message in a friend chat reaches the other side by push, and the
-- parents hear when one waits unread (Hadar 28/11/2026, DECISIONS #80).
--
-- Why: the kids' tablet has a daily Family Link limit on the whole device, so
-- opening the app only to check for a message spends their screen time. His
-- answers:
--   * the kid and the friend get "a new message from X" - never the words;
--   * the parents get one push when a message to a KID waits unread for 15
--     minutes (a parent may change the minutes), so they can decide to give
--     more time. Never for a message the friend has not read;
--   * one push to the parents per unread wave: more messages before the kid
--     opens the chat add nothing; several kids waiting in one run are one
--     push. A new wave starts once the kid has opened the chat;
--   * nothing 22:00-07:00 in the family's local time: held, sent at 07:00.
--
-- Nothing here knows whether the tablet is locked (a web app cannot), so the
-- parents' push says "waiting", not "locked".
--
-- Who is told is decided in claim_friend_pushes() (service role only): the
-- two sides of a live chat and the trip's owners, who already read every chat
-- (friend_messages_owner_select). No push carries a message's text.
--
-- Rollback: docs/upgrade/migrations/00112_friend_message_push.down.sql.
-- Probe: scripts/rls/probes/112_friend_message_push.sql.

-- ============ the parents' setting ============

create table friend_push_settings (
  trip_id uuid primary key references trips(id),
  parent_alert_minutes integer not null default 15
    check (parent_alert_minutes between 5 and 240),
  updated_at timestamptz not null default now()
);

comment on table friend_push_settings is
  'How long a message to a kid in a friend chat waits unread before the '
  'parents are told (00112). Owners read and write; no row = 15 minutes.';

alter table friend_push_settings enable row level security;

create policy friend_push_settings_owner_select on friend_push_settings
  for select using (trip_id = (select public.member_trip_as('owner')));
create policy friend_push_settings_owner_insert on friend_push_settings
  for insert with check (trip_id = (select public.member_trip_as('owner')));
create policy friend_push_settings_owner_update on friend_push_settings
  for update using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));

revoke all on friend_push_settings from anon, authenticated;
grant select on friend_push_settings to authenticated;
grant insert (trip_id, parent_alert_minutes), update (parent_alert_minutes, updated_at)
  on friend_push_settings to authenticated;

-- ============ what was already told ============

create table friend_push_state (
  link_id uuid not null references friend_links(id) on delete cascade,
  -- the side the messages are for (the kid or the friend)
  member_id uuid not null references members(id) on delete cascade,
  -- the newest message told to that side by push
  notified_at timestamptz,
  -- the last push to the parents about this side (kids only)
  parents_notified_at timestamptz,
  primary key (link_id, member_id)
);

comment on table friend_push_state is
  'When each side of a friend chat, and the parents about it, were last told '
  'by push (00112). Service role only: RLS on, no policies.';

create index idx_friend_push_state_member on friend_push_state(member_id);

alter table friend_push_state enable row level security;
-- no policy on purpose: only claim_friend_pushes() reads and writes it
revoke all on friend_push_state from anon, authenticated;

-- what exists when this ships is not news: no push for it, to anyone
insert into friend_push_state (link_id, member_id, notified_at, parents_notified_at)
select f.id, s.member_id, now(), now()
  from friend_links f
 cross join lateral (values (f.kid_member_id), (f.member_id)) as s(member_id)
 where f.member_id is not null and f.revoked_at is null
on conflict do nothing;

-- ============ who is due a push, claimed once ============

-- Returns the pushes due now in the trip and marks them told, in one
-- transaction behind one lock, so the trigger call and the sweep never both
-- send the same one. push-send calls it only outside quiet hours.
--   kind 'message': `member_id` is the side to tell, `n` the messages not yet
--                   told, `from_name` the other side's name.
--   kind 'parents': a message to the kid `member_id` waits unread since
--                   `since`; `n` is how many wait. Sent to the owners.
create or replace function public.claim_friend_pushes(p_trip_id uuid)
returns table (
  kind text,
  link_id uuid,
  member_id uuid,
  from_name text,
  kid_name text,
  n integer,
  since timestamptz
)
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare
  minutes integer;
  r record;
begin
  perform pg_advisory_xact_lock(hashtext('claim_friend_pushes'));

  select coalesce((select s.parent_alert_minutes from friend_push_settings s
                    where s.trip_id = p_trip_id), 15)
    into minutes;

  -- a chat that started after this shipped has no state row yet
  insert into friend_push_state (link_id, member_id)
  select f.id, s.member_id
    from friend_links f
   cross join lateral (values (f.kid_member_id), (f.member_id)) as s(member_id)
   where f.trip_id = p_trip_id and f.member_id is not null and f.revoked_at is null
  on conflict do nothing;

  for r in
    select f.id as link_id,
           p.member_id,
           p.member_id = f.kid_member_id as is_kid,
           case when p.member_id = f.kid_member_id then f.friend_name else k.display_name end as from_name,
           k.display_name as kid_name,
           rd.read_at,
           p.notified_at,
           p.parents_notified_at,
           (select count(*)::integer from friend_messages m
             where m.link_id = f.id and m.sender_id <> p.member_id
               and m.created_at > greatest(coalesce(rd.read_at, '-infinity'),
                                           coalesce(p.notified_at, '-infinity'))) as fresh,
           (select max(m.created_at) from friend_messages m
             where m.link_id = f.id and m.sender_id <> p.member_id) as newest,
           (select count(*)::integer from friend_messages m
             where m.link_id = f.id and m.sender_id <> p.member_id
               and m.created_at > coalesce(rd.read_at, '-infinity')) as unread,
           (select min(m.created_at) from friend_messages m
             where m.link_id = f.id and m.sender_id <> p.member_id
               and m.created_at > coalesce(rd.read_at, '-infinity')) as oldest_unread
      from friend_links f
      join members k on k.id = f.kid_member_id
      join friend_push_state p on p.link_id = f.id
       and p.member_id in (f.kid_member_id, f.member_id)
      left join friend_reads rd on rd.link_id = f.id and rd.member_id = p.member_id
     where f.trip_id = p_trip_id and f.member_id is not null and f.revoked_at is null
  loop
    if r.fresh > 0 then
      -- up to the newest message told, not the clock: a message saved a moment
      -- before this ran but not yet visible to it stays due
      update friend_push_state s set notified_at = r.newest
       where s.link_id = r.link_id and s.member_id = r.member_id;
      kind := 'message'; link_id := r.link_id; member_id := r.member_id;
      from_name := r.from_name; kid_name := r.kid_name; n := r.fresh; since := null;
      return next;
    end if;

    -- once per wave: not again until the kid has opened the chat since
    if r.is_kid
       and r.oldest_unread is not null
       and r.oldest_unread <= now() - make_interval(mins => minutes)
       and (r.parents_notified_at is null
            or (r.read_at is not null and r.read_at > r.parents_notified_at)) then
      update friend_push_state s set parents_notified_at = now()
       where s.link_id = r.link_id and s.member_id = r.member_id;
      kind := 'parents'; link_id := r.link_id; member_id := r.member_id;
      from_name := r.from_name; kid_name := r.kid_name; n := r.unread; since := r.oldest_unread;
      return next;
    end if;
  end loop;
end;
$$;
revoke execute on function public.claim_friend_pushes(uuid) from public, anon, authenticated;
grant execute on function public.claim_friend_pushes(uuid) to service_role;

-- ============ trigger: ask push-send to look, right away ============
-- The body carries no id: push-send asks claim_friend_pushes() what is due,
-- so a forged call can at most send a due push a little earlier.

create or replace function public.notify_friend_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := public.functions_base_url() || '/push-send',
    headers := public.cron_secret_header(),
    body := '{"type": "friend-messages"}'::jsonb
  );
  return new;
end;
$$;
revoke execute on function public.notify_friend_message() from public, anon, authenticated;

create trigger friend_messages_notify
  after insert on friend_messages
  for each row execute function public.notify_friend_message();

-- ============ sweep: the parents' wait, and what quiet hours held ============

select cron.schedule(
  'push-friend-messages',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := public.functions_base_url() || '/push-send',
    headers := public.cron_secret_header(),
    body := '{"type": "friend-messages"}'::jsonb
  );
  $job$
);
