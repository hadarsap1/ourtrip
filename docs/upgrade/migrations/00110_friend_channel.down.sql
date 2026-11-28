-- Rollback of 00110. Cut every friend off first, so no friend is left as a
-- plain guest with a live tablet.
update kid_devices set revoked_at = now()
 where revoked_at is null and member_id in (select member_id from friend_links where member_id is not null);
update guests_allowlist g set revoked_at = now()
  from members m
 where m.id in (select member_id from friend_links where member_id is not null)
   and g.trip_id = m.trip_id and lower(g.email) = lower(m.email) and g.revoked_at is null;

-- 00024's current_member_id
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
  limit 1;
$$;

drop function if exists public.friend_redeem(text, uuid, uuid, text, text, text);
drop function if exists public.friend_revoke(uuid);
drop function if exists public.mark_friend_read(uuid);
drop function if exists public.my_friend_channels();
drop table if exists friend_reads;
drop table if exists friend_messages;
drop function if exists public.my_friend_link_ids();
drop table if exists friend_links;
drop function if exists public.notify_friend_connected();
