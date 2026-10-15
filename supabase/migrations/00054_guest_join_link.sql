-- Guests join through one link (DECISIONS #37, Hadar 15/10/2026).
--
-- Was: a WhatsApp message asking people to reply with their address, then a
-- parent typing every address into the invite sheet. Now: one link per trip,
-- posted in the family / class group. Whoever opens it asks to join - with
-- Google (one tap, the address is verified) or by typing a name and an
-- address - and a parent approves each request. Approval is the existing
-- guest-invite path, unchanged, so a request on its own grants NOTHING: every
-- guest policy still goes through is_active_guest_of(), which needs a
-- guests_allowlist row that only a parent can create.
--
--   guest_join_links     one row per trip: the link's token. Resetting the
--                        link replaces the token; the old one stops working.
--   guest_join_requests  who asked. Owner-only by RLS. Written only through
--                        submit_guest_join() (security definer), which takes
--                        the address from the Google login when there is one.
--
-- The address is typed by the person themselves (or comes from their own
-- Google login): that is the point - nobody is added to the list who did not
-- ask to be on it.

-- ============ TABLES ============

create table guest_join_links (
  trip_id uuid primary key references trips(id),
  -- 122 random bits; gen_random_uuid() is core Postgres, no pgcrypto needed
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_by uuid not null references members(id),
  created_at timestamptz not null default now()
);

create table guest_join_requests (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  email text not null check (email = lower(email)),
  display_name text not null check (length(display_name) between 1 and 60),
  -- set when the request came from a Google login: the address is verified
  auth_user_id uuid references auth.users(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  -- last time the person pressed "send"; the rate limit counts this
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references members(id),
  unique (trip_id, email)
);

create index guest_join_requests_trip_status_idx on guest_join_requests (trip_id, status);
create index guest_join_requests_auth_user_idx on guest_join_requests (auth_user_id);
create index guest_join_links_created_by_idx on guest_join_links (created_by);
create index guest_join_requests_decided_by_idx on guest_join_requests (decided_by);

alter table guest_join_links enable row level security;
alter table guest_join_requests enable row level security;

-- parents only; nobody else has a policy (anon, kids, guests read nothing)
create policy guest_join_links_owner_all on guest_join_links
  for all using (public.is_owner_of(trip_id)) with check (public.is_owner_of(trip_id));
create policy guest_join_requests_owner_all on guest_join_requests
  for all using (public.is_owner_of(trip_id)) with check (public.is_owner_of(trip_id));

-- ============ OWNER: the link ============

-- The trip's join token, created on first use. p_reset replaces it: anyone
-- holding the old link gets "this link is no longer valid".
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
    set token = case when p_reset then replace(gen_random_uuid()::text, '-', '') else guest_join_links.token end,
        created_by = case when p_reset then excluded.created_by else guest_join_links.created_by end,
        created_at = case when p_reset then now() else guest_join_links.created_at end
  returning token into t;
  return t;
end;
$$;

revoke execute on function public.guest_join_token(uuid, boolean) from public, anon;
grant execute on function public.guest_join_token(uuid, boolean) to authenticated;

-- ============ ANYONE WITH THE LINK ============

-- Where the signed-in caller stands on this trip: 'member' (already in -
-- family, or a guest whose access is active), 'pending' (asked; a declined
-- request also reads 'pending', the family does not announce a "no"), or
-- null. Anonymous callers always get null.
create or replace function public.guest_join_caller_status(p_trip_id uuid)
returns text
language sql stable security definer set search_path = public as $$
  with me as (
    select lower(nullif(auth.jwt()->>'email', '')) as email
     where auth.uid() is not null
  )
  select case
    when exists (
      select 1 from members m, me
       where m.trip_id = p_trip_id and lower(m.email) = me.email
         and (m.role <> 'guest' or exists (
               select 1 from guests_allowlist g
                where g.trip_id = m.trip_id and lower(g.email) = me.email and g.revoked_at is null)))
      then 'member'
    when exists (
      select 1 from guest_join_requests r, me
       where r.trip_id = p_trip_id and r.email = me.email and r.status in ('pending', 'declined'))
      then 'pending'
  end;
$$;

revoke execute on function public.guest_join_caller_status(uuid) from public, anon, authenticated;

-- Is this a live link, and (when signed in) where does the caller stand?
-- {"valid": false} for an unknown or reset token; nothing else is revealed.
create or replace function public.guest_join_info(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_trip uuid;
begin
  select trip_id into v_trip from guest_join_links where token = p_token;
  if v_trip is null then
    return jsonb_build_object('valid', false);
  end if;
  return jsonb_build_object('valid', true, 'status', public.guest_join_caller_status(v_trip));
end;
$$;

revoke execute on function public.guest_join_info(text) from public;
grant execute on function public.guest_join_info(text) to anon, authenticated;

-- Ask to join. Signed in with Google → the address is the login's own
-- (verified) and p_email is ignored; otherwise p_email is what the person
-- typed. Returns 'pending' | 'member' | 'invalid' | 'bad_input' | 'busy'.
-- Limits: 30 sends per trip per hour and 200 open requests, so a link that
-- leaks out of the group cannot flood the parents' list or their phones.
create or replace function public.submit_guest_join(p_token text, p_name text, p_email text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_trip uuid;
  v_name text := left(btrim(coalesce(p_name, '')), 60);
  v_jwt_email text := case when auth.uid() is not null then lower(nullif(auth.jwt()->>'email', '')) end;
  v_email text := coalesce(v_jwt_email, lower(btrim(coalesce(p_email, ''))));
begin
  select trip_id into v_trip from guest_join_links where token = p_token;
  if v_trip is null then
    return 'invalid';
  end if;
  if v_name = '' or length(v_email) > 254 or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    return 'bad_input';
  end if;

  -- already in: nothing to ask. Only a signed-in caller learns it is their
  -- own address; an anonymous one gets the usual 'pending', so the link
  -- cannot be used to test which addresses are on the list.
  if exists (
    select 1 from members m
     where m.trip_id = v_trip and lower(m.email) = v_email
       and (m.role <> 'guest' or exists (
             select 1 from guests_allowlist g
              where g.trip_id = v_trip and lower(g.email) = v_email and g.revoked_at is null))
  ) then
    return case when v_jwt_email is not null then 'member' else 'pending' end;
  end if;

  if (select count(*) from guest_join_requests
       where trip_id = v_trip and requested_at > now() - interval '1 hour') >= 30
     or (select count(*) from guest_join_requests
          where trip_id = v_trip and status = 'pending') >= 200 then
    return 'busy';
  end if;

  insert into guest_join_requests (trip_id, email, display_name, auth_user_id)
  values (v_trip, v_email, v_name, case when v_jwt_email is not null then auth.uid() end)
  on conflict (trip_id, email) do update
    set display_name = excluded.display_name,
        auth_user_id = coalesce(excluded.auth_user_id, guest_join_requests.auth_user_id),
        requested_at = now(),
        -- a declined request stays declined (no fresh notification); an
        -- approved one whose access was since revoked asks again
        status = case when guest_join_requests.status = 'declined' then 'declined' else 'pending' end,
        decided_at = case when guest_join_requests.status = 'declined' then guest_join_requests.decided_at end,
        decided_by = case when guest_join_requests.status = 'declined' then guest_join_requests.decided_by end;

  return 'pending';
end;
$$;

revoke execute on function public.submit_guest_join(text, text, text) from public;
grant execute on function public.submit_guest_join(text, text, text) to anon, authenticated;

-- ============ APPROVAL FOLLOWS THE ALLOWLIST ============

-- A request is approved by inviting the address (guest-invite - the same call
-- as a manual invite). Marking it here, not in the client, also closes a
-- request when a parent invites the same person by hand.
create or replace function public.guest_join_mark_approved()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.revoked_at is null then
    update guest_join_requests
       set status = 'approved', decided_at = now(), decided_by = new.invited_by
     where trip_id = new.trip_id and email = lower(new.email) and status <> 'approved';
  end if;
  return new;
end;
$$;

revoke execute on function public.guest_join_mark_approved() from public, anon, authenticated;

create trigger guests_allowlist_join_approved
  after insert or update of revoked_at on guests_allowlist
  for each row execute function public.guest_join_mark_approved();

-- ============ NOTIFY THE PARENTS ============

create or replace function public.notify_guest_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status <> 'pending') then
    perform net.http_post(
      url := public.functions_base_url() || '/push-send',
      headers := public.cron_secret_header(),
      body := jsonb_build_object('type', 'guest-request', 'request_id', new.id)
    );
  end if;
  return new;
end;
$$;

revoke execute on function public.notify_guest_request() from public, anon, authenticated;

create trigger guest_join_requests_notify
  after insert or update of status on guest_join_requests
  for each row execute function public.notify_guest_request();
