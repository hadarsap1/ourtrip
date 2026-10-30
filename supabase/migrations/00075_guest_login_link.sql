-- Guest sign-in link from the login screen (30/10/2026).
--
-- A guest who joined with an email (no Google) had one way in: the magic link
-- sent on approval. Once it expired, or never arrived, the login screen only
-- offered Google and the guest was stuck (first case: a guest approved on
-- 30/10 who does not remember her Gmail password).
--
-- The new guest-login-link function (verify_jwt = false, no caller yet) asks
-- this function whether to send a fresh link. Everything that decides it lives
-- here, so the function cannot be talked into mailing anyone else:
--   * the email is on the active trip's allowlist and not revoked
--   * it belongs to a guest member (never an owner or kid: they have their
--     own ways in, and a link must not become a back door to those roles)
--   * at most one link per email per minute, so the open endpoint cannot be
--     used to flood a guest's inbox
-- The answer is only seen by the function; the caller always gets the same
-- reply, so the endpoint does not reveal who is on the list.

create table if not exists private.guest_login_link_sends (
  email text primary key,
  sent_at timestamptz not null default now()
);
alter table private.guest_login_link_sends enable row level security;  -- no policies
revoke all on private.guest_login_link_sends from public, anon, authenticated;

create or replace function public.claim_guest_login_link(p_email text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if v_email = '' then
    return false;
  end if;

  if not exists (
    select 1
      from public.guests_allowlist a
      join public.trips t on t.id = a.trip_id and t.is_active
      join public.members m on m.trip_id = a.trip_id and lower(m.email) = v_email
     where lower(a.email) = v_email
       and a.revoked_at is null
       and m.role = 'guest'
  ) then
    return false;
  end if;

  insert into private.guest_login_link_sends as s (email, sent_at)
  values (v_email, now())
  on conflict (email) do update
    set sent_at = now()
    where s.sent_at < now() - interval '1 minute';

  return found;
end;
$$;

revoke execute on function public.claim_guest_login_link(text) from public, anon, authenticated;
grant execute on function public.claim_guest_login_link(text) to service_role;
