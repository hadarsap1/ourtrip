-- Rollback of 00111. 00110 allows one chat per friend, so the chats a parent
-- added (no code) are DELETED with their messages. Take a backup first.
delete from friend_links where code_hash is null;

drop function if exists public.friend_add_kid(uuid, uuid);
drop function if exists public.friend_close_chat(uuid);
drop index if exists friend_links_open_pair;
drop index if exists idx_friend_links_member;
alter table friend_links drop constraint if exists friend_links_code_or_member;
alter table friend_links alter column code_hash set not null;
alter table friend_links add constraint friend_links_member_id_key unique (member_id);

-- 00110's current_member_id
create or replace function public.current_member_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select m.id from members m
  where ((auth.uid() is not null and m.auth_user_id = auth.uid())
      or (nullif(auth.jwt()->>'member_id','') is not null
          and m.id = (auth.jwt()->>'member_id')::uuid))
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

-- 00110's friend_revoke
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
