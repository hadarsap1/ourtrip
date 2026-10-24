-- 00055: a members row is linked by email only to a Google account or a
-- password-less (invited) account, never to a self-registered password account.
begin;
\i scripts/rls/seed.sql

-- three guests invited, none signed in yet
insert into members (trip_id, email, display_name, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'invited@probe.test', 'Invited', 'guest'),
  ('00000000-0000-0000-0000-0000000000a1', 'viagoogle@probe.test', 'Google', 'guest'),
  ('00000000-0000-0000-0000-0000000000a1', 'victim@probe.test', 'Victim', 'guest');
insert into guests_allowlist (trip_id, email, invited_by) values
  ('00000000-0000-0000-0000-0000000000a1', 'invited@probe.test', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000a1', 'viagoogle@probe.test', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000a1', 'victim@probe.test', '00000000-0000-0000-0000-0000000000b1');
insert into auth.users (id, email, encrypted_password, raw_app_meta_data) values
  -- guest-invite: service-role account, no password, magic link
  ('00000000-0000-0000-0000-0000000000f1', 'invited@probe.test', '', '{"provider":"email","providers":["email"]}'),
  -- Google sign-in
  ('00000000-0000-0000-0000-0000000000f2', 'viagoogle@probe.test', null, '{"provider":"google","providers":["google"]}'),
  -- someone registered the victim's address with a password, unconfirmed by anyone
  ('00000000-0000-0000-0000-0000000000f3', 'victim@probe.test', '$2a$10$hash', '{"provider":"email","providers":["email"]}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f3","email":"victim@probe.test","role":"authenticated"}', true);
select rls.check('password account for someone else''s address: not linked', public.link_member_to_auth_user() is null);
select rls.check('password account: no guest access', not public.is_active_guest_of('00000000-0000-0000-0000-0000000000a1'));
reset role;
select rls.check('the victim''s row stays unlinked', (select auth_user_id is null from members where email = 'victim@probe.test'));

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","email":"invited@probe.test","role":"authenticated"}', true);
select rls.check('invited (magic link, no password): linked as guest', public.link_member_to_auth_user() = 'guest');
select rls.check('invited: guest access', public.is_active_guest_of('00000000-0000-0000-0000-0000000000a1'));
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f2","email":"viagoogle@probe.test","role":"authenticated"}', true);
select rls.check('Google: linked as guest', public.link_member_to_auth_user() = 'guest');
reset role;

-- already-linked members keep working (owner, seeded with a link)
set local role authenticated; select rls.as_owner();
select rls.check('owner already linked: still owner', public.link_member_to_auth_user() = 'owner');
reset role;
select rls.check('anon cannot call link_member_to_auth_user',
  not has_function_privilege('anon', 'public.link_member_to_auth_user()', 'execute'));

rollback;
