-- 00054: guests join through one link. Only a parent sees or makes the link
-- and the requests; anyone with the link can ask; asking grants nothing until
-- a parent invites the address.
begin;
\i scripts/rls/seed.sql

-- ---- the link ----
set local role authenticated; select rls.as_owner();
create temp table tok as select public.guest_join_token('00000000-0000-0000-0000-0000000000a1') as t;
grant select on tok to anon, authenticated;
select rls.check('owner: gets a token', (select length(t) = 32 from tok));
select rls.check('owner: the same token on the second call',
  (select t from tok) = public.guest_join_token('00000000-0000-0000-0000-0000000000a1'));
reset role;

set local role authenticated; select rls.as_guest();
select rls.check('guest: cannot get the token',
  (select count(*) from guest_join_links) = 0);
reset role;
do $$ begin
  set local role authenticated; perform rls.as_kid();
  perform public.guest_join_token('00000000-0000-0000-0000-0000000000a1');
  raise exception 'FAIL  kid: guest_join_token must refuse';
exception when insufficient_privilege then raise notice 'PASS  kid: guest_join_token refuses';
end $$;
reset role;
select rls.check('anon cannot call guest_join_token',
  not has_function_privilege('anon', 'public.guest_join_token(uuid, boolean)', 'execute'));

-- ---- asking ----
set local role anon; select rls.as_anon();
select rls.check('anon: a live link is valid', (public.guest_join_info((select t from tok)))->>'valid' = 'true');
select rls.check('anon: an unknown link is not', (public.guest_join_info('nope'))->>'valid' = 'false');
select rls.check('anon: asks with a typed address',
  public.submit_guest_join((select t from tok), 'Savta', ' Savta@Example.com ') = 'pending');
select rls.check('anon: a bad address is refused', public.submit_guest_join((select t from tok), 'X', 'not-an-email') = 'bad_input');
select rls.check('anon: an empty name is refused', public.submit_guest_join((select t from tok), '  ', 'a@b.co') = 'bad_input');
select rls.check('anon: a wrong token is refused', public.submit_guest_join('nope', 'X', 'a@b.co') = 'invalid');
select rls.check('anon: an active guest''s address reads pending, not member',
  public.submit_guest_join((select t from tok), 'X', 'guest@probe.test') = 'pending');
select rls.check('anon: reads no requests', (select count(*) from guest_join_requests) = 0);
reset role;
select rls.check('the request is stored lowercased, unverified, pending',
  (select email = 'savta@example.com' and auth_user_id is null and status = 'pending'
     from guest_join_requests where display_name = 'Savta'));
select rls.check('no request was stored for the active guest', not exists (select 1 from guest_join_requests where email = 'guest@probe.test'));
select rls.check('asking grants nothing: no member, no allowlist row',
  not exists (select 1 from members where email = 'savta@example.com')
  and not exists (select 1 from guests_allowlist where email = 'savta@example.com'));

-- signed in with Google: the login's address wins over anything typed
set local role authenticated; select rls.as_outsider();
select rls.check('outsider: status before asking is null', (public.guest_join_info((select t from tok)))->>'status' is null);
select rls.check('outsider: asks', public.submit_guest_join((select t from tok), 'Friend', 'someone-else@example.com') = 'pending');
select rls.check('outsider: status is pending', (public.guest_join_info((select t from tok)))->>'status' = 'pending');
select rls.check('outsider: still reads no requests and no guest content',
  (select count(*) from guest_join_requests) = 0 and (select count(*) from photos) = 0);
reset role;
select rls.check('the Google request carries the login address and user',
  exists (select 1 from guest_join_requests where email = 'outsider@probe.test' and auth_user_id = '00000000-0000-0000-0000-00000000aa05')
  and not exists (select 1 from guest_join_requests where email = 'someone-else@example.com'));

set local role authenticated; select rls.as_guest();
select rls.check('guest: an active guest is told member', public.submit_guest_join((select t from tok), 'G', null) = 'member');
select rls.check('guest: reads no requests', (select count(*) from guest_join_requests) = 0);
update guest_join_requests set status = 'approved';
reset role;
select rls.check('guest: cannot approve a request', not exists (select 1 from guest_join_requests where status = 'approved'));
set local role authenticated; select rls.as_kid();
select rls.check('kid: reads no requests and no link',
  (select count(*) from guest_join_requests) = 0 and (select count(*) from guest_join_links) = 0);
reset role;

-- the revoked guest may ask again
set local role authenticated; select rls.as_revoked();
select rls.check('revoked guest: is not a member any more', (public.guest_join_info((select t from tok)))->>'status' is null);
select rls.check('revoked guest: can ask again', public.submit_guest_join((select t from tok), 'Back', null) = 'pending');
reset role;

-- ---- the parents ----
set local role authenticated; select rls.as_owner();
select rls.check('owner: sees the three requests', (select count(*) from guest_join_requests where status = 'pending') = 3);
update guest_join_requests set status = 'declined', decided_at = now() where email = 'savta@example.com';
reset role;
select rls.check('owner: can decline one', (select status from guest_join_requests where email = 'savta@example.com') = 'declined');

-- declined stays declined, and reads pending to the asker
set local role anon; select rls.as_anon();
select rls.check('anon: asking again after a no still reads pending', public.submit_guest_join((select t from tok), 'Savta', 'savta@example.com') = 'pending');
reset role;
select rls.check('the declined request stays declined', (select status from guest_join_requests where email = 'savta@example.com') = 'declined');

-- approval = an allowlist row (what guest-invite writes); the trigger closes the request
insert into members (trip_id, email, display_name, role) values ('00000000-0000-0000-0000-0000000000a1', 'outsider@probe.test', 'Friend', 'guest');
insert into guests_allowlist (trip_id, email, invited_by) values ('00000000-0000-0000-0000-0000000000a1', 'outsider@probe.test', '00000000-0000-0000-0000-0000000000b1');
select rls.check('inviting the address approves the request',
  (select status = 'approved' and decided_by = '00000000-0000-0000-0000-0000000000b1' from guest_join_requests where email = 'outsider@probe.test'));
update guests_allowlist set revoked_at = null where email = 'gone@probe.test';
select rls.check('re-inviting a revoked guest approves their request',
  (select status from guest_join_requests where email = 'gone@probe.test') = 'approved');
set local role authenticated; select rls.as_outsider();
select rls.check('approved: status is member', (public.guest_join_info((select t from tok)))->>'status' = 'member');
reset role;

-- ---- reset ----
set local role authenticated; select rls.as_owner();
select rls.check('owner: reset gives a new token',
  public.guest_join_token('00000000-0000-0000-0000-0000000000a1', true) <> (select t from tok));
reset role;
set local role anon; select rls.as_anon();
select rls.check('anon: the old link is dead', (public.guest_join_info((select t from tok)))->>'valid' = 'false');
select rls.check('anon: asking on the old link is refused', public.submit_guest_join((select t from tok), 'X', 'x@y.co') = 'invalid');
reset role;

-- ---- the limit ----
set local role authenticated; select rls.as_owner();
create temp table tok2 as select public.guest_join_token('00000000-0000-0000-0000-0000000000a1') as t;
grant select on tok2 to anon, authenticated;
reset role;
set local role anon; select rls.as_anon();
select public.submit_guest_join((select t from tok2), 'n' || i, 'flood' || i || '@example.com') from generate_series(1, 40) i;
select rls.check('anon: past 30 an hour the link answers busy',
  public.submit_guest_join((select t from tok2), 'late', 'late@example.com') = 'busy');
reset role;
select rls.check('at most 30 sends an hour were stored', (select count(*) from guest_join_requests where requested_at > now() - interval '1 hour') <= 30);

rollback;
