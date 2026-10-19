-- A shorter join link (Hadar 19/10/2026: "the guests' link should be much
-- shorter"). Was /join/<32 hex chars>; now /j/<8 chars> (the short path is a
-- redirect in next.config.ts, /join/ keeps working).
--
-- 8 characters from a 32-letter lowercase alphabet without the look-alikes
-- (no i, l, o, u) = 40 random bits. Enough for what the token guards: holding
-- it lets someone ASK to join, and a parent still approves every request
-- (00054). Guessing one live token among 2^40 is out of reach, and a guessed
-- one would only put a request in front of the parents.
--
-- Existing links are left alone so a link already posted in a group keeps
-- working. A parent gets the short one by pressing "new link" (the reset
-- below), which also retires the long one.

create or replace function public.guest_join_new_token()
returns text
language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := '0123456789abcdefghjkmnpqrstvwxyz';
  -- 16 random bytes from core Postgres (no pgcrypto); 256 / 32 has no bias
  b bytea := uuid_send(gen_random_uuid());
  t text := '';
  i int;
begin
  -- bytes 6 and 8 carry the uuid version / variant bits; skip them
  foreach i in array array[0, 1, 2, 3, 4, 5, 9, 10] loop
    t := t || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return t;
end;
$$;

-- not a secret on its own (a fresh random string); kept off the anon API
revoke execute on function public.guest_join_new_token() from public, anon;
grant execute on function public.guest_join_new_token() to authenticated;

alter table guest_join_links alter column token set default public.guest_join_new_token();

-- same as 00054, only the reset now draws a short token
create or replace function public.guest_join_token(p_trip_id uuid, p_reset boolean default false)
returns text
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if not public.is_owner_of(p_trip_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into guest_join_links (trip_id, created_by)
  values (p_trip_id, public.current_member_id())
  on conflict (trip_id) do update
    set token = case when p_reset then public.guest_join_new_token() else guest_join_links.token end,
        created_by = case when p_reset then excluded.created_by else guest_join_links.created_by end,
        created_at = case when p_reset then now() else guest_join_links.created_at end
  returning token into t;
  return t;
end;
$$;

revoke execute on function public.guest_join_token(uuid, boolean) from public, anon;
grant execute on function public.guest_join_token(uuid, boolean) to authenticated;
