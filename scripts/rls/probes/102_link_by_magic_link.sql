-- 00102: a guest who signs in by the emailed link is linked even though
-- guest-invite's account has a (random) password; a password session is not;
-- the first link cleans the account; only Google counts on a join request;
-- PIN attempts are reserved atomically; wrong registration codes are capped.
begin;
\i scripts/rls/seed.sql

insert into members (trip_id, email, display_name, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'magic@probe.test', 'Magic', 'guest'),
  ('00000000-0000-0000-0000-0000000000a1', 'savta@probe.test', 'Savta', 'guest');
insert into guests_allowlist (trip_id, email, invited_by) values
  ('00000000-0000-0000-0000-0000000000a1', 'magic@probe.test', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000a1', 'savta@probe.test', '00000000-0000-0000-0000-0000000000b1');
insert into auth.users (id, email, encrypted_password, raw_app_meta_data) values
  -- made by guest-invite: Supabase gave it a random password
  ('00000000-0000-0000-0000-000000010201', 'magic@probe.test', '$2a$10$random', '{"provider":"email","providers":["email"]}'),
  -- a stranger registered savta's address with a password first
  ('00000000-0000-0000-0000-000000010202', 'savta@probe.test', '$2a$10$stranger', '{"provider":"email","providers":["email"]}'),
  -- a self-registered password account asking to join
  ('00000000-0000-0000-0000-000000010203', 'asker@probe.test', '$2a$10$asker', '{"provider":"email","providers":["email"]}'),
  -- a Google account asking to join
  ('00000000-0000-0000-0000-000000010204', 'gasker@probe.test', null, '{"provider":"google","providers":["google"]}');
insert into auth.sessions (id, user_id) values
  ('00000000-0000-0000-0000-0000001020a1', '00000000-0000-0000-0000-000000010202'), -- the stranger's
  ('00000000-0000-0000-0000-0000001020a2', '00000000-0000-0000-0000-000000010202'); -- savta's, by the link

-- 1. the bug: the emailed link links, even with a password on the account
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000010201","email":"magic@probe.test","role":"authenticated","amr":[{"method":"magiclink","timestamp":1}]}', true);
select rls.check('emailed link, account has a password: linked as guest', public.link_member_to_auth_user() = 'guest');
select rls.check('emailed link: guest access', public.is_active_guest_of('00000000-0000-0000-0000-0000000000a1'));
reset role;

-- a password session for someone else's address is still never linked
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000010202","email":"savta@probe.test","role":"authenticated","session_id":"00000000-0000-0000-0000-0000001020a1","amr":[{"method":"password","timestamp":1}]}', true);
select rls.check('password session: not linked', public.link_member_to_auth_user() is null);
select rls.check('password session: no guest access', not public.is_active_guest_of('00000000-0000-0000-0000-0000000000a1'));
reset role;
select rls.check('savta''s row stays unlinked after the password session',
  (select auth_user_id is null from members where email = 'savta@probe.test'));

-- no amr at all (old token shape) proves nothing either
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000010202","email":"savta@probe.test","role":"authenticated"}', true);
select rls.check('no amr: not linked', public.link_member_to_auth_user() is null);
reset role;

-- 2. savta signs in by the link on the stranger's account: linked, and cleaned
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000010202","email":"savta@probe.test","role":"authenticated","session_id":"00000000-0000-0000-0000-0000001020a2","amr":[{"method":"otp","timestamp":2}]}', true);
select rls.check('real owner by the link: linked as guest', public.link_member_to_auth_user() = 'guest');
reset role;
select rls.check('first link clears the stranger''s password',
  (select encrypted_password = '' from auth.users where id = '00000000-0000-0000-0000-000000010202'));
select rls.check('first link ends the stranger''s session',
  not exists (select 1 from auth.sessions where id = '00000000-0000-0000-0000-0000001020a1'));
select rls.check('first link keeps the session that proved the address',
  exists (select 1 from auth.sessions where id = '00000000-0000-0000-0000-0000001020a2'));

-- already-linked members are untouched: the owner keeps their password
update auth.users set encrypted_password = '$2a$10$owner' where id = (select auth_user_id from members where id = '00000000-0000-0000-0000-0000000000b1');
set local role authenticated; select rls.as_owner();
select rls.check('owner already linked: still owner', public.link_member_to_auth_user() = 'owner');
reset role;
select rls.check('owner: no cleaning without a new link',
  (select encrypted_password = '$2a$10$owner' from auth.users where id = (select auth_user_id from members where id = '00000000-0000-0000-0000-0000000000b1')));
select rls.check('anon cannot call link_member_to_auth_user',
  not has_function_privilege('anon', 'public.link_member_to_auth_user()', 'execute'));

-- 3. join requests: only Google counts as signed in
insert into guest_join_links (trip_id, token, open_token, created_by)
values ('00000000-0000-0000-0000-0000000000a1', 'probe102handed', 'probe102open', '00000000-0000-0000-0000-0000000000b1')
on conflict (trip_id) do update set token = excluded.token, open_token = excluded.open_token;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000010203","email":"asker@probe.test","role":"authenticated"}', true);
select rls.check('password account on the open link: google_only',
  public.submit_guest_join('probe102open', 'Asker') = 'google_only');
select rls.check('password account on the handed-out link: asks, as a typed address',
  public.submit_guest_join('probe102handed', 'Asker', 'asker@probe.test') = 'pending');
select rls.check('password account with no typed address: still asks, by its login address',
  public.submit_guest_join('probe102handed', 'Asker again') = 'pending');
reset role;
select rls.check('password account: the request is not marked proven',
  (select auth_user_id is null from guest_join_requests where email = 'asker@probe.test'));

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000010204","email":"gasker@probe.test","role":"authenticated"}', true);
select rls.check('Google account on the open link: asks',
  public.submit_guest_join('probe102open', 'GAsker') = 'pending');
reset role;
select rls.check('Google account: the request is marked proven',
  (select auth_user_id = '00000000-0000-0000-0000-000000010204' from guest_join_requests where email = 'gasker@probe.test'));

-- the guest linked by the emailed link (not Google) opening a join link: member
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000010201","email":"magic@probe.test","role":"authenticated","amr":[{"method":"magiclink","timestamp":1}]}', true);
select rls.check('linked guest by the emailed link, on a join link: member',
  public.submit_guest_join('probe102handed', 'Magic') = 'member'
  and public.submit_guest_join('probe102open', 'Magic') = 'member');
reset role;

-- 4. PIN attempts are reserved before the check; the (max+1)th locks
select rls.check('kid_unlock_attempt: service role only',
  not has_function_privilege('authenticated', 'public.kid_unlock_attempt(uuid, integer, integer)', 'execute')
  and not has_function_privilege('anon', 'public.kid_unlock_attempt(uuid, integer, integer)', 'execute'));
update kid_devices set failed_attempts = 0, locked_until = null;
select rls.check('attempt 1 of 2 allowed',
  (public.kid_unlock_attempt((select id from kid_devices limit 1), 2, 15)->>'attempt') = '1');
select rls.check('attempt 2 of 2 allowed',
  (public.kid_unlock_attempt((select id from kid_devices limit 1), 2, 15)->>'attempt') = '2');
select rls.check('attempt 3 while 2 are still unanswered: locked',
  (public.kid_unlock_attempt((select id from kid_devices limit 1), 2, 15)->>'reason') = 'locked');
select rls.check('while locked: still locked',
  (public.kid_unlock_attempt((select id from kid_devices limit 1), 2, 15)->>'reason') = 'locked');
select rls.check('unknown device: unknown',
  (public.kid_unlock_attempt('00000000-0000-0000-0000-00000000dead', 2, 15)->>'reason') = 'unknown');

-- wrong registration codes: 30 per 15 minutes
select rls.check('kid_register_*: service role only',
  not has_function_privilege('authenticated', 'public.kid_register_allowed()', 'execute')
  and not has_function_privilege('anon', 'public.kid_register_failed()', 'execute'));
select rls.check('register allowed with no failures', public.kid_register_allowed());
select public.kid_register_failed() from generate_series(1, 29);
select rls.check('29 failures: still allowed', public.kid_register_allowed());
select public.kid_register_failed();
select rls.check('30 failures: refused', not public.kid_register_allowed());
update private.kid_register_failures set at = now() - interval '16 minutes';
select rls.check('after 15 minutes: allowed again', public.kid_register_allowed());

rollback;
