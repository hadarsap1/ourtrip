-- The login screen's "ask to join" takes a Google sign-in only (QA 15/11/2026).
--
-- 00093 handed the trip's join token to anyone who opens the app's address.
-- That token is the one in the WhatsApp message and on the printed QR, so the
-- open internet got what a class parent gets: the page with the family's
-- names, and a form that takes ANY typed name and address. From there anyone
-- could (1) ask as "סבתא רותי" with their own address and wait for an
-- "approve all", (2) send 30 requests an hour, each a push to both parents,
-- until 200 waiting requests answer "busy" to real guests, (3) retype someone
-- else's address and overwrite the name on their waiting request.
--
-- Now there are two tokens per trip:
--   token       the link a parent hands out (WhatsApp, QR). Unchanged: Google
--               or a typed address.
--   open_token  what the login screen gets. A request through it must come
--               from a signed-in Google account, so the address is proven and
--               every request costs an account. The handed-out token is no
--               longer given to the public.
-- Resetting the link (guest_join_token(reset)) renews both.
--
-- Also, on either token: a request that is NOT signed in can no longer change
-- a request that is already waiting for the same address (3).
--
-- Asking still grants nothing; every guest policy goes through the allowlist a
-- parent writes. Probe: scripts/rls/probes/95_open_join_google_only.sql.

alter table public.guest_join_links
  add column if not exists open_token text;

update public.guest_join_links
   set open_token = public.guest_join_new_token()
 where open_token is null;

alter table public.guest_join_links
  alter column open_token set default public.guest_join_new_token(),
  alter column open_token set not null;

alter table public.guest_join_links
  drop constraint if exists guest_join_links_open_token_key;
alter table public.guest_join_links
  add constraint guest_join_links_open_token_key unique (open_token);

-- parents: same as 00057, and a reset renews the open token too
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
        open_token = case when p_reset then public.guest_join_new_token() else guest_join_links.open_token end,
        created_by = case when p_reset then excluded.created_by else guest_join_links.created_by end,
        created_at = case when p_reset then now() else guest_join_links.created_at end
  returning token into t;
  return t;
end;
$$;

-- the login screen: the open token, never the handed-out one
create or replace function public.guest_join_open_token()
returns text
language sql stable security definer set search_path = ''
as $$
  select l.open_token
    from public.guest_join_links l
    join public.trips t on t.id = l.trip_id and t.is_active
   order by t.created_at desc
   limit 1;
$$;

-- the join page: either token is valid; google_only tells the page to offer
-- the Google button alone
create or replace function public.guest_join_info(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_trip uuid;
  v_open boolean;
begin
  select trip_id, open_token = p_token into v_trip, v_open
    from guest_join_links where token = p_token or open_token = p_token;
  if v_trip is null then
    return jsonb_build_object('valid', false);
  end if;
  return jsonb_build_object(
    'valid', true,
    'status', public.guest_join_caller_status(v_trip),
    'google_only', v_open);
end;
$$;

-- 00067's body with the two rules above
create or replace function public.submit_guest_join(
  p_token text, p_name text, p_email text default null, p_kid_names text[] default '{}'
)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_trip uuid;
  v_open boolean;
  v_name text := left(btrim(coalesce(p_name, '')), 60);
  v_jwt_email text := case when auth.uid() is not null then lower(nullif(auth.jwt()->>'email', '')) end;
  v_email text := coalesce(v_jwt_email, lower(btrim(coalesce(p_email, ''))));
  v_kids text[] := public.normalize_kid_names(p_kid_names);
begin
  select trip_id, open_token = p_token into v_trip, v_open
    from guest_join_links where token = p_token or open_token = p_token;
  if v_trip is null then
    return 'invalid';
  end if;
  -- through the login screen: a proven address only
  if v_open and v_jwt_email is null then
    return 'google_only';
  end if;
  if v_name = '' or length(v_email) > 254 or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    return 'bad_input';
  end if;

  if exists (
    select 1 from members m
     where m.trip_id = v_trip and lower(m.email) = v_email
       and (m.role <> 'guest' or exists (
             select 1 from guests_allowlist g
              where g.trip_id = v_trip and lower(g.email) = v_email and g.revoked_at is null))
  ) then
    return case when v_jwt_email is not null then 'member' else 'pending' end;
  end if;

  -- a typed address proves nothing: it may open a request, not rewrite one
  -- that is already there (waiting or declined). Same answer either way.
  if v_jwt_email is null and exists (
    select 1 from guest_join_requests
     where trip_id = v_trip and email = v_email and status in ('pending', 'declined')
  ) then
    return 'pending';
  end if;

  if (select count(*) from guest_join_requests
       where trip_id = v_trip and requested_at > now() - interval '1 hour') >= 30
     or (select count(*) from guest_join_requests
          where trip_id = v_trip and status = 'pending') >= 200 then
    return 'busy';
  end if;

  insert into guest_join_requests (trip_id, email, display_name, auth_user_id, kid_names)
  values (v_trip, v_email, v_name, case when v_jwt_email is not null then auth.uid() end, v_kids)
  on conflict (trip_id, email) do update
    set display_name = excluded.display_name,
        auth_user_id = coalesce(excluded.auth_user_id, guest_join_requests.auth_user_id),
        kid_names = excluded.kid_names,
        requested_at = now(),
        status = case when guest_join_requests.status = 'declined' then 'declined' else 'pending' end,
        decided_at = case when guest_join_requests.status = 'declined' then guest_join_requests.decided_at end,
        decided_by = case when guest_join_requests.status = 'declined' then guest_join_requests.decided_by end;

  return 'pending';
end;
$$;
