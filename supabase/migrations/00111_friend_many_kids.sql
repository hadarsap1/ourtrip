-- One friend, a separate private chat with each of several kids
-- (Hadar 28/11/2026, DECISIONS #79 amended).
--
-- His answers: the same friend on the same tablet can have a chat with Ella
-- and a separate one with Omer; the parents read both, as before; no group
-- chat. A parent adds the second kid from the friends screen (no new code, the
-- tablet stays as it is). A parent may close one chat (the friend stays
-- connected through the others) or cut the friend off entirely.
--
--   * A chat is still one friend_links row. A row added by a parent carries
--     the friend's member_id from the start and no code (code_hash null).
--   * At most one open chat per friend and kid (partial unique index).
--   * current_member_id(): a friend resolves while at least one of their chats
--     is open and a device is bound. Closing the last chat is cutting off.
--   * A kid still reads only the chats where they are the kid: my_friend_link_ids
--     is unchanged, so Ella never reads Omer's chat with the same friend.
--
-- Rollback: docs/upgrade/migrations/00111_friend_many_kids.down.sql.
-- Probe: scripts/rls/probes/111_friend_many_kids.sql.

-- ============ table ============

alter table friend_links drop constraint friend_links_member_id_key;
alter table friend_links alter column code_hash drop not null;
alter table friend_links add constraint friend_links_code_or_member
  check (code_hash is not null or member_id is not null);

create unique index friend_links_open_pair on friend_links(member_id, kid_member_id)
  where member_id is not null and revoked_at is null;
create index idx_friend_links_member on friend_links(member_id);

comment on table friend_links is
  'One private chat between a friend and one kid (00110, 00111). The first '
  'row of a friend holds the one-time code; more chats are added by a parent. '
  'Parents read; writes go through friend-auth and the friend_* functions.';

-- ============ who a caller is ============

-- 00110's body; the friend condition now reads "some chat is open" instead of
-- "the one chat is open".
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
    -- a friend resolves only while one of their chats is open and a device is
    -- bound, so cutting a friend off stops every policy on their next query
    and (
      not exists (select 1 from friend_links f where f.member_id = m.id)
      or (
        exists (select 1 from friend_links f
                 where f.member_id = m.id and f.revoked_at is null)
        and exists (select 1 from kid_devices d
                     where d.member_id = m.id and d.revoked_at is null)
      )
    )
  limit 1;
$$;

-- ============ cutting a friend off (parents) ============

-- Every chat of the friend, the device and the guest-list entry in one step.
-- The chats stay for the parents to read. On a code that was not used yet it
-- cancels that code only.
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
  update friend_links set revoked_at = coalesce(revoked_at, now())
   where id = f.id
      or (f.member_id is not null and member_id = f.member_id and trip_id = f.trip_id);
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

-- One chat only. The friend keeps the others; if it was their last open chat
-- this is cutting off (friend_revoke), so no friend is left connected with
-- nothing to do.
create or replace function public.friend_close_chat(p_link_id uuid)
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
  if f.member_id is null or not exists (
    select 1 from friend_links o
     where o.member_id = f.member_id and o.id <> f.id and o.revoked_at is null
  ) then
    return public.friend_revoke(f.id);
  end if;
  update friend_links set revoked_at = coalesce(revoked_at, now()) where id = f.id;
  return true;
end;
$$;
revoke execute on function public.friend_close_chat(uuid) from public, anon;
grant execute on function public.friend_close_chat(uuid) to authenticated;

-- ============ another kid for a connected friend (parents) ============

-- A new chat with the same friend, the same tablet, no code. Only for a friend
-- who is connected now, only with a real kid of the same trip, and only one
-- open chat per kid. Returns the new chat's id, or null.
create or replace function public.friend_add_kid(p_link_id uuid, p_kid_member_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  f record;
  v_id uuid;
begin
  select id, trip_id, member_id, friend_name, labels into f from friend_links
   where id = p_link_id
     and trip_id = public.member_trip_as('owner')
     and member_id is not null
     and revoked_at is null
   for update;
  if not found then
    return null;
  end if;
  if not exists (
    select 1 from members k
     where k.id = p_kid_member_id and k.trip_id = f.trip_id
       and k.role = 'kid' and not k.is_preview
  ) then
    return null;
  end if;
  if not exists (
    select 1 from kid_devices d where d.member_id = f.member_id and d.revoked_at is null
  ) then
    return null;
  end if;
  insert into friend_links
    (trip_id, kid_member_id, member_id, friend_name, labels, code_hash, expires_at, used_at, created_by)
  values
    (f.trip_id, p_kid_member_id, f.member_id, f.friend_name, f.labels, null, now(), now(),
     public.current_member_id())
  on conflict (member_id, kid_member_id) where member_id is not null and revoked_at is null
  do nothing
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.friend_add_kid(uuid, uuid) from public, anon;
grant execute on function public.friend_add_kid(uuid, uuid) to authenticated;
