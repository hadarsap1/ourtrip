-- 00075: claim_guest_login_link decides who the open guest-login-link
-- function mails. Approved, unrevoked guests of the active trip only, once a
-- minute, and no API role can call it (only the function's service role).
begin;
\i scripts/rls/seed.sql
update trips set is_active = true where id = '00000000-0000-0000-0000-0000000000a1';

-- an owner on the allowlist by mistake must still get no link
insert into guests_allowlist (trip_id, email, invited_by) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@probe.test', '00000000-0000-0000-0000-0000000000b1');

select rls.check('approved guest gets a link', public.claim_guest_login_link('Guest@Probe.test '));
select rls.check('same guest within the minute: no second link', not public.claim_guest_login_link('guest@probe.test'));
update private.guest_login_link_sends set sent_at = now() - interval '2 minutes';
select rls.check('same guest after the minute: a link again', public.claim_guest_login_link('guest@probe.test'));
select rls.check('revoked guest: no link', not public.claim_guest_login_link('gone@probe.test'));
select rls.check('owner on the allowlist: no link', not public.claim_guest_login_link('owner@probe.test'));
select rls.check('stranger: no link', not public.claim_guest_login_link('outsider@probe.test'));
select rls.check('empty email: no link', not public.claim_guest_login_link(''));

update trips set is_active = false where id = '00000000-0000-0000-0000-0000000000a1';
update private.guest_login_link_sends set sent_at = now() - interval '2 minutes';
select rls.check('guest of a trip that is not active: no link', not public.claim_guest_login_link('guest@probe.test'));

select rls.check('anon / authenticated cannot call it',
  not has_function_privilege('anon', 'public.claim_guest_login_link(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.claim_guest_login_link(text)', 'execute'));
select rls.check('service role can call it',
  has_function_privilege('service_role', 'public.claim_guest_login_link(text)', 'execute'));
select rls.check('no API role can read the send log',
  not has_table_privilege('anon', 'private.guest_login_link_sends', 'select')
  and not has_table_privilege('authenticated', 'private.guest_login_link_sends', 'select'));

rollback;
