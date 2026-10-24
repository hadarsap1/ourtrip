-- Link a member by email only to an account that proves the address (Hadar
-- 16/10/2026, found in the join-link QA).
--
-- Supabase Auth here has sign-ups open (the join link needs Google sign-up
-- for new people) and "Confirm email" off (Hadar: no extra step). Together
-- that lets anyone open an email+password account for someone else's
-- address, and link_member_to_auth_user used to link a members row to any
-- account whose JWT carried the same address. Someone who knew which address
-- a parent was about to approve could register it first and receive that
-- guest's access.
--
-- Now a row is linked by email only when the signed-in account is:
--   * a Google login (Google verified the address), or
--   * an account without a password - the ones guest-invite creates with the
--     service role and signs in by magic link sent to that address.
-- A self-registered password account is never linked. Kids are not affected:
-- kid-auth links their rows directly by id with the service role.
-- Rows already linked are untouched; the role lookup is unchanged.

create or replace function public.link_member_to_auth_user()
returns member_role
language plpgsql security definer set search_path = public as $$
declare
  r member_role;
  v_proves_address boolean;
begin
  if auth.uid() is null then
    return null;
  end if;

  select coalesce(u.raw_app_meta_data->'providers', '[]'::jsonb) ? 'google'
         or u.raw_app_meta_data->>'provider' = 'google'
         or coalesce(u.encrypted_password, '') = ''
    into v_proves_address
    from auth.users u
   where u.id = auth.uid();

  if coalesce(v_proves_address, false) then
    update members
       set auth_user_id = auth.uid()
     where auth_user_id is null
       and email is not null
       and lower(email) = lower(coalesce(auth.jwt()->>'email', ''));
  end if;

  select role into r from members where auth_user_id = auth.uid() limit 1;
  return r;
end;
$$;

revoke execute on function public.link_member_to_auth_user() from public, anon;
grant execute on function public.link_member_to_auth_user() to authenticated;
