-- 00095: the login screen's token takes Google-proven requests only, the
-- handed-out token is no longer public, and an unsigned request cannot
-- rewrite one that is waiting.
begin;
\i scripts/rls/seed.sql

set local role authenticated; select rls.as_owner();
create temp table tok as select public.guest_join_token('00000000-0000-0000-0000-0000000000a1') as t;
grant select on tok to anon, authenticated;
reset role;
create temp table otok as select open_token as t from guest_join_links;
grant select on otok to anon, authenticated;
select rls.check('the two tokens differ', (select t from tok) <> (select t from otok));

set local role anon; select rls.as_anon();
select rls.check('anon: the login screen gets the open token, not the handed-out one',
  public.guest_join_open_token() = (select t from otok));
select rls.check('anon: open token is valid and google_only',
  (public.guest_join_info((select t from otok))->>'valid')::boolean
  and (public.guest_join_info((select t from otok))->>'google_only')::boolean);
select rls.check('anon: handed-out token is valid and not google_only',
  (public.guest_join_info((select t from tok))->>'valid')::boolean
  and not (public.guest_join_info((select t from tok))->>'google_only')::boolean);
select rls.check('anon: a typed address through the open token is refused',
  public.submit_guest_join((select t from otok), 'סבתא רותי', 'fake@probe.test') = 'google_only');
reset role;
select rls.check('nothing was written for the refused request', not exists (select 1 from guest_join_requests));

-- a signed-in outsider through the open token: a request under the proven address
set local role authenticated; select rls.as_outsider();
select rls.check('outsider (signed in): open token makes a pending request',
  public.submit_guest_join((select t from otok), 'Real Name', 'ignored@probe.test') = 'pending');
reset role;
select rls.check('the request carries the login''s address and user',
  exists (select 1 from guest_join_requests where email = 'outsider@probe.test' and auth_user_id is not null and display_name = 'Real Name'));

-- a typed request through the handed-out token still works...
set local role anon; select rls.as_anon();
select rls.check('anon: typed address through the handed-out token still asks',
  public.submit_guest_join((select t from tok), 'Class Parent', 'parent@probe.test') = 'pending');
-- ...but cannot rewrite a waiting request, its own or a signed-in one
select rls.check('anon: retyping a waiting address answers pending',
  public.submit_guest_join((select t from tok), 'Someone Else', 'parent@probe.test') = 'pending'
  and public.submit_guest_join((select t from tok), 'Impostor', 'outsider@probe.test', array['x']) = 'pending');
reset role;
select rls.check('the waiting requests kept their names',
  (select display_name from guest_join_requests where email = 'parent@probe.test') = 'Class Parent'
  and (select display_name from guest_join_requests where email = 'outsider@probe.test') = 'Real Name'
  and (select kid_names from guest_join_requests where email = 'outsider@probe.test') = '{}');

-- the signed-in owner of the address may still update their own request
set local role authenticated; select rls.as_outsider();
select rls.check('signed in: can rename their own waiting request',
  public.submit_guest_join((select t from tok), 'New Name') = 'pending');
reset role;
select rls.check('renamed', (select display_name from guest_join_requests where email = 'outsider@probe.test') = 'New Name');

-- a reset renews both tokens
set local role authenticated; select rls.as_owner();
select public.guest_join_token('00000000-0000-0000-0000-0000000000a1', true);
reset role;
set local role anon; select rls.as_anon();
select rls.check('after a reset both old tokens are dead',
  not (public.guest_join_info((select t from tok))->>'valid')::boolean
  and not (public.guest_join_info((select t from otok))->>'valid')::boolean
  and public.guest_join_open_token() <> (select t from otok));
select rls.check('anon: still cannot read guest_join_links', not exists (select 1 from guest_join_links));
reset role;

rollback;
