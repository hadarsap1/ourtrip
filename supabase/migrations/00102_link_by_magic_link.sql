-- 00102: a guest who signs in by the emailed link is let in (security review
-- 19/11/2026), and an account nobody proved can no longer look "proven".
--
-- 1. THE BUG. 00055 linked a members row by email only for a Google login or
--    an account "without a password", on the idea that guest-invite creates
--    password-less accounts. It does not: Supabase gives every account made
--    with auth.admin.createUser a random password of its own. Read back from
--    production on 19/11: every guest account guest-invite created has one.
--    So a guest who signs in only by the link in the email was never linked,
--    and AuthGate signed them straight out. One guest hit it on 15/11.
--
--    What proves the address is HOW this session signed in, not whether the
--    account has a password: the JWT's `amr` says it. A session minted by the
--    emailed link (magiclink / otp / invite) was opened by someone holding
--    that mailbox. A password session proves nothing - sign-ups are open and
--    "Confirm email" is off (00055), so anyone can register any address.
--
-- 2. PRE-REGISTERED ACCOUNTS. Because sign-ups are open with no
--    confirmation, someone could register savta@ with a password BEFORE a
--    parent approves her. Approval then mails the link for that same account,
--    savta signs in and is linked - and the stranger's password and session
--    still open it. (The same was already true when the real owner later
--    signs in with Google and Supabase merges the identities.) So the first
--    time a row is linked by email, the account is cleaned: its password is
--    cleared and every other session it has is ended. Only this session
--    survives, and it is the one that proved the address. Production on
--    19/11 shows no account of this kind; this is so there never is one.
--
-- 3. "PROVEN" JOIN REQUESTS. submit_guest_join stored auth_user_id - which
--    the parents' screen shows as "via Google" and "approve all" trusts - for
--    any signed-in account, including a password account for someone else's
--    address. Now only a Google account counts as signed in there; any other
--    is treated like a typed address (and the login screen's open link, which
--    takes Google only, answers google_only).
--
-- 4. KID DEVICES (kid-auth). Two service-role-only helpers:
--    kid_unlock_attempt counts a PIN attempt BEFORE the PIN is checked, under
--    a row lock, so parallel requests cannot each get a free guess past the
--    lockout. kid_register_allowed / kid_register_failed cap wrong
--    registration codes at 30 per 15 minutes across the project.
--
-- Probe: scripts/rls/probes/102_link_by_magic_link.sql.

-- ============ 1 + 2. link_member_to_auth_user ============

create or replace function public.link_member_to_auth_user()
returns member_role
language plpgsql security definer set search_path = public as $$
declare
  r member_role;
  v_google boolean;
  v_mailbox boolean;
  v_session uuid := nullif(auth.jwt()->>'session_id', '')::uuid;
  v_linked integer := 0;
begin
  if auth.uid() is null then
    return null;
  end if;

  select coalesce(u.raw_app_meta_data->'providers', '[]'::jsonb) ? 'google'
         or u.raw_app_meta_data->>'provider' = 'google'
    into v_google
    from auth.users u
   where u.id = auth.uid();

  -- this session came from the emailed link, so whoever holds it read that mailbox
  select exists (
    select 1
      from jsonb_array_elements(
             case when jsonb_typeof(auth.jwt()->'amr') = 'array' then auth.jwt()->'amr' else '[]'::jsonb end
           ) a
     where a->>'method' in ('magiclink', 'otp', 'invite')
  ) into v_mailbox;

  if coalesce(v_google, false) or v_mailbox then
    update members
       set auth_user_id = auth.uid()
     where auth_user_id is null
       and email is not null
       and lower(email) = lower(coalesce(auth.jwt()->>'email', ''));
    get diagnostics v_linked = row_count;

    if v_linked > 0 then
      -- nothing set up before the address was proven may keep the account open
      update auth.users set encrypted_password = '' where id = auth.uid();
      delete from auth.sessions
       where user_id = auth.uid()
         and (v_session is null or id <> v_session);
    end if;
  end if;

  select role into r from members where auth_user_id = auth.uid() limit 1;
  return r;
end;
$$;
revoke execute on function public.link_member_to_auth_user() from public, anon;
grant execute on function public.link_member_to_auth_user() to authenticated;

-- ============ 3. submit_guest_join: only Google counts as signed in ============

-- 00095's body with two changes: v_jwt_email is set only for a Google
-- account, and a caller whose account is already linked as a member of the
-- trip is told 'member' first, however they signed in.
create or replace function public.submit_guest_join(
  p_token text, p_name text, p_email text default null, p_kid_names text[] default '{}'
)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_trip uuid;
  v_open boolean;
  v_name text := left(btrim(coalesce(p_name, '')), 60);
  v_jwt_email text := case
    when auth.uid() is not null and exists (
      select 1 from auth.users u
       where u.id = auth.uid()
         and (coalesce(u.raw_app_meta_data->'providers', '[]'::jsonb) ? 'google'
              or u.raw_app_meta_data->>'provider' = 'google'))
    then lower(nullif(auth.jwt()->>'email', '')) end;
  -- a signed-in account that is not Google still names its address, but only
  -- as a typed one would: unproven, and unable to rewrite a waiting request
  v_email text := coalesce(
    v_jwt_email,
    nullif(lower(btrim(coalesce(p_email, ''))), ''),
    case when auth.uid() is not null then lower(nullif(auth.jwt()->>'email', '')) end,
    '');
  v_kids text[] := public.normalize_kid_names(p_kid_names);
begin
  select trip_id, open_token = p_token into v_trip, v_open
    from guest_join_links where token = p_token or open_token = p_token;
  if v_trip is null then
    return 'invalid';
  end if;
  -- already in, by whatever sign-in linked the account (a guest who came by
  -- the emailed link is not a Google account, and is still a member)
  if auth.uid() is not null and exists (
    select 1 from members m
     where m.trip_id = v_trip and m.auth_user_id = auth.uid()
       and (m.role <> 'guest' or exists (
             select 1 from guests_allowlist g
              where g.trip_id = v_trip and lower(g.email) = lower(m.email) and g.revoked_at is null))
  ) then
    return 'member';
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

-- ============ 4. kid devices: attempts counted atomically ============

-- Reserves one PIN attempt for a device, or says it is locked. Called by
-- kid-auth BEFORE the PIN is checked: the row lock makes parallel requests
-- queue, so at most p_max PINs are ever tried per lock window.
create or replace function public.kid_unlock_attempt(p_device_id uuid, p_max integer, p_lock_minutes integer)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  d record;
  v_attempt integer;
  v_until timestamptz;
begin
  select id, failed_attempts, locked_until into d
    from kid_devices
   where id = p_device_id and revoked_at is null
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown');
  end if;
  if d.locked_until is not null and d.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', d.locked_until);
  end if;

  v_attempt := coalesce(d.failed_attempts, 0) + 1;
  if v_attempt > p_max then
    -- the earlier attempts are still being checked; this one waits out a lock
    v_until := now() + make_interval(mins => p_lock_minutes);
    update kid_devices set failed_attempts = 0, locked_until = v_until where id = d.id;
    return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', v_until);
  end if;

  update kid_devices set failed_attempts = v_attempt, locked_until = null where id = d.id;
  return jsonb_build_object('ok', true, 'attempt', v_attempt);
end;
$$;
revoke execute on function public.kid_unlock_attempt(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.kid_unlock_attempt(uuid, integer, integer) to service_role;

-- wrong registration codes, project-wide (the code is not tied to a device yet)
create table if not exists private.kid_register_failures (
  at timestamptz not null default now()
);
create index if not exists kid_register_failures_at_idx on private.kid_register_failures (at);
alter table private.kid_register_failures enable row level security;
revoke all on private.kid_register_failures from public, anon, authenticated;

create or replace function public.kid_register_allowed()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select count(*) from private.kid_register_failures
           where at > now() - interval '15 minutes') < 30;
$$;
revoke execute on function public.kid_register_allowed() from public, anon, authenticated;
grant execute on function public.kid_register_allowed() to service_role;

create or replace function public.kid_register_failed()
returns void
language sql security definer set search_path = ''
as $$
  delete from private.kid_register_failures where at < now() - interval '1 day';
  insert into private.kid_register_failures default values;
$$;
revoke execute on function public.kid_register_failed() from public, anon, authenticated;
grant execute on function public.kid_register_failed() to service_role;
