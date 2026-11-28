-- Friends on their own tablet, with a private chat with one of the kids
-- (Hadar 28/11/2026, DECISIONS #79).
--
-- His answers: a parent makes a one-time code, the friend's parents type it on
-- the friend's tablet; the friend sees everything a guest sees and may react
-- as a guest does, with no approval; a private text channel between the friend
-- and one kid, with no approval per message; the parents can read it (and the
-- kid and the friend are told so) and can cut the friend off at any time.
-- This is the one place a kid's words reach someone outside the family without
-- a parent first (amends #33, for this channel only - the wall is unchanged).
--
--   * A friend is an ordinary GUEST member (hard rule 2 stands: three roles),
--     with a made-up address on the guest list and a row in friend_links.
--     So every guest policy applies as is, and nothing of the family's does.
--   * The friend's tablet is bound like a kid's: a kid_devices row, PIN with
--     lockout in kid-auth `unlock`. A friend resolves as a member only while
--     the link is not revoked and a device is live (current_member_id).
--   * The code: 8 characters, one use, 48 hours, stored as SHA-256, redeemed
--     only by the friend-auth function (service role).
--
-- Rollback: docs/upgrade/migrations/00110_friend_channel.down.sql.
-- Probe: scripts/rls/probes/110_friend_channel.sql.

-- ============ tables ============

create table friend_links (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  -- the family's kid the friend writes with
  kid_member_id uuid not null references members(id),
  -- the friend's own member row; null until the code is used
  member_id uuid unique references members(id),
  friend_name text not null check (length(btrim(friend_name)) between 1 and 60),
  -- guest groups the friend is put in when the code is used (00063)
  labels text[] not null default '{}',
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references members(id),
  created_at timestamptz not null default now(),
  unique (id, trip_id)
);

comment on table friend_links is
  'A friend of one kid: the one-time code, then the friend''s guest member '
  '(00110). Parents read; writes go through friend-auth and friend_revoke().';

create index idx_friend_links_trip on friend_links(trip_id);
create index idx_friend_links_kid on friend_links(kid_member_id);
create index idx_friend_links_created_by on friend_links(created_by);

create table friend_messages (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null,
  trip_id uuid not null references trips(id),
  sender_id uuid not null references members(id),
  body text not null check (length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  foreign key (link_id, trip_id) references friend_links(id, trip_id) on delete cascade
);

comment on table friend_messages is
  'The private text chat of one friend_links row (00110): the kid and the '
  'friend write, they and the parents read.';

create index idx_friend_messages_link on friend_messages(link_id, created_at);
create index idx_friend_messages_trip on friend_messages(trip_id);
create index idx_friend_messages_sender on friend_messages(sender_id);

create table friend_reads (
  link_id uuid not null references friend_links(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (link_id, member_id)
);

comment on table friend_reads is
  'When each side last opened a friend chat (00110). Written and read only '
  'through mark_friend_read() and my_friend_channels(): RLS on, no policies.';

create index idx_friend_reads_member on friend_reads(member_id);

-- ============ who a caller is ============

-- 00024's body plus the friend condition: a friend resolves only while the
-- link is live and a device is bound, so cutting a friend off stops every
-- policy on their next query.
create or replace function public.current_member_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select m.id from members m
  where ((auth.uid() is not null and m.auth_user_id = auth.uid())
      or (nullif(auth.jwt()->>'member_id','') is not null
          and m.id = (auth.jwt()->>'member_id')::uuid))
    -- a kid resolves only while an un-revoked device binding exists, so
    -- revoking a device cuts access on the very next query
    and (
      m.role <> 'kid'
      or exists (
        select 1 from kid_devices d
        where d.member_id = m.id and d.revoked_at is null
      )
    )
    and not exists (
      select 1 from friend_links f
      where f.member_id = m.id
        and (f.revoked_at is not null or not exists (
              select 1 from kid_devices d
              where d.member_id = m.id and d.revoked_at is null))
    )
  limit 1;
$$;

-- The chats the caller takes part in (kid or friend), live ones only. Empty for
-- everyone else, parents included: they read by trip, and never write.
create or replace function public.my_friend_link_ids()
returns uuid[]
language sql stable security definer set search_path = public
as $$
  select coalesce(array_agg(f.id), '{}')
    from members m
    join friend_links f
      on f.trip_id = m.trip_id
     and f.member_id is not null
     and f.revoked_at is null
     and ((m.role = 'kid' and f.kid_member_id = m.id)
       or (m.role = 'guest' and f.member_id = m.id
           and m.trip_id = public.active_guest_trip()))
   where m.id = public.current_member_id();
$$;
revoke execute on function public.my_friend_link_ids() from public, anon;
grant execute on function public.my_friend_link_ids() to authenticated;

-- ============ policies ============

alter table friend_links enable row level security;
alter table friend_messages enable row level security;
alter table friend_reads enable row level security;

create policy friend_links_owner_select on friend_links
  for select using (trip_id = (select public.member_trip_as('owner')));

-- no write policy at all, and the code's hash never leaves the database
revoke all on friend_links from anon, authenticated;
grant select (id, trip_id, kid_member_id, member_id, friend_name, labels,
              expires_at, used_at, revoked_at, created_by, created_at)
  on friend_links to authenticated;

create policy friend_messages_owner_select on friend_messages
  for select using (trip_id = (select public.member_trip_as('owner')));

create policy friend_messages_owner_delete on friend_messages
  for delete using (trip_id = (select public.member_trip_as('owner')));

create policy friend_messages_member_select on friend_messages
  for select using (link_id = any ((select public.my_friend_link_ids())::uuid[]));

create policy friend_messages_member_insert on friend_messages
  for insert with check (
    sender_id = (select public.current_member_id())
    and link_id = any ((select public.my_friend_link_ids())::uuid[])
  );

-- a writer names the chat and the words; the id and the clock are the
-- database's, and nothing is ever edited
revoke all on friend_messages from anon;
revoke insert, update on friend_messages from authenticated;
grant insert (link_id, trip_id, sender_id, body) on friend_messages to authenticated;

revoke all on friend_reads from anon, authenticated;

-- ============ what the screens ask ============

-- The caller's chats with the other side's name: a kid cannot read members
-- (00051) and a friend cannot read friend_links.
create or replace function public.my_friend_channels()
returns table (
  link_id uuid,
  trip_id uuid,
  friend_member_id uuid,
  kid_member_id uuid,
  friend_name text,
  kid_name text,
  unread integer,
  last_at timestamptz,
  revoked boolean
)
language sql stable security definer set search_path = public
as $$
  with me as (select public.current_member_id() as id),
       owned as (select public.member_trip_as('owner') as trip_id)
  select f.id, f.trip_id, f.member_id, f.kid_member_id, f.friend_name, k.display_name,
         (select count(*)::integer from friend_messages x
           where x.link_id = f.id
             and x.sender_id <> me.id
             and x.created_at > coalesce(
                   (select r.read_at from friend_reads r
                     where r.link_id = f.id and r.member_id = me.id),
                   '-infinity'::timestamptz)),
         (select max(x.created_at) from friend_messages x where x.link_id = f.id),
         f.revoked_at is not null
    from friend_links f
    join members k on k.id = f.kid_member_id
    cross join me
    cross join owned
   where me.id is not null
     and f.member_id is not null
     -- a cut-off chat stays listed for the parents only: my_friend_link_ids()
     -- has already dropped it for the two sides
     and (f.id = any (public.my_friend_link_ids()) or f.trip_id = owned.trip_id)
   order by f.created_at;
$$;
revoke execute on function public.my_friend_channels() from public, anon;
grant execute on function public.my_friend_channels() to authenticated;

create or replace function public.mark_friend_read(p_link_id uuid)
returns void
language sql security definer set search_path = public
as $$
  insert into friend_reads (link_id, member_id, read_at)
  select f.id, public.current_member_id(), now()
    from friend_links f
   where f.id = p_link_id
     and public.current_member_id() is not null
     and (f.id = any (public.my_friend_link_ids())
          or f.trip_id = public.member_trip_as('owner'))
  on conflict (link_id, member_id) do update set read_at = excluded.read_at;
$$;
revoke execute on function public.mark_friend_read(uuid) from public, anon;
grant execute on function public.mark_friend_read(uuid) to authenticated;

-- ============ cutting a friend off (parents) ============

-- Link, device and guest-list entry in one step. The chat stays for the
-- parents to read. Also cancels a code that was not used yet.
create or replace function public.friend_revoke(p_link_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  f record;
begin
  select id, trip_id, member_id into f from friend_links
   where id = p_link_id and trip_id = public.member_trip_as('owner')
   for update;
  if not found then
    return false;
  end if;
  update friend_links set revoked_at = coalesce(revoked_at, now()) where id = f.id;
  if f.member_id is not null then
    update kid_devices set revoked_at = now()
     where member_id = f.member_id and revoked_at is null;
    update guests_allowlist g set revoked_at = coalesce(g.revoked_at, now())
      from members m
     where m.id = f.member_id and g.trip_id = m.trip_id and lower(g.email) = lower(m.email);
  end if;
  return true;
end;
$$;
revoke execute on function public.friend_revoke(uuid) from public, anon;
grant execute on function public.friend_revoke(uuid) to authenticated;

-- ============ using a code (friend-auth only) ============

-- All or nothing: the code is spent, and the guest member, the list entry and
-- the device binding exist, or none of it. The row lock makes two tablets with
-- the same code queue, and the second finds it used.
create or replace function public.friend_redeem(
  p_code_hash text,
  p_member_id uuid,
  p_auth_user_id uuid,
  p_email text,
  p_device_token_hash text,
  p_pin_hash text
)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  f record;
begin
  select * into f from friend_links
   where code_hash = p_code_hash
     and used_at is null and revoked_at is null and expires_at > now()
   for update;
  if not found then
    return null;
  end if;

  insert into members (id, trip_id, auth_user_id, email, display_name, role)
  values (p_member_id, f.trip_id, p_auth_user_id, lower(p_email), btrim(f.friend_name), 'guest');
  insert into guests_allowlist (trip_id, email, invited_by, labels)
  values (f.trip_id, lower(p_email), f.created_by, f.labels);
  insert into kid_devices (member_id, device_token_hash, pin_hash, approved_by)
  values (p_member_id, p_device_token_hash, p_pin_hash, f.created_by);
  update friend_links set member_id = p_member_id, used_at = now() where id = f.id;
  return btrim(f.friend_name);
end;
$$;
revoke execute on function public.friend_redeem(text, uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.friend_redeem(text, uuid, uuid, text, text, text) to service_role;

-- ============ the parents hear when a friend's tablet connects ============

create or replace function public.notify_friend_connected()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := public.functions_base_url() || '/push-send',
    headers := public.cron_secret_header(),
    body := jsonb_build_object('type', 'friend-connected', 'link_id', new.id)
  );
  return new;
end;
$$;
revoke execute on function public.notify_friend_connected() from public, anon, authenticated;

create trigger friend_links_notify_connected
  after update of used_at on friend_links
  for each row when (old.used_at is null and new.used_at is not null)
  execute function public.notify_friend_connected();

alter publication supabase_realtime add table public.friend_messages;
