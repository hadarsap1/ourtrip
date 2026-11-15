-- 00093: the login screen gets the active trip's join token, so someone who
-- opens the app's address and was never approved can ask to join. It hands
-- out only that token (null before a link exists, nothing of an inactive
-- trip), never creates one, and asking still grants nothing.
begin;
\i scripts/rls/seed.sql

set local role anon; select rls.as_anon();
select rls.check('anon: no join link yet - null, and none is created',
  public.guest_join_open_token() is null);
reset role;
select rls.check('no join link row was created by asking', not exists (select 1 from guest_join_links));

set local role authenticated; select rls.as_owner();
create temp table tok as select public.guest_join_token('00000000-0000-0000-0000-0000000000a1') as t;
grant select on tok to anon, authenticated;
reset role;

set local role anon; select rls.as_anon();
select rls.check('anon: gets the active trip''s join token',
  public.guest_join_open_token() = (select t from tok));
select rls.check('anon: still cannot read guest_join_links', not exists (select 1 from guest_join_links));
select rls.check('anon: asking with it only makes a pending request',
  public.submit_guest_join(public.guest_join_open_token(), 'probe', 'new@probe.test') = 'pending');
reset role;

set local role authenticated; select rls.as_outsider();
select rls.check('outsider: gets the same token, nothing more',
  public.guest_join_open_token() = (select t from tok));
select rls.check('outsider: reads no requests', not exists (select 1 from guest_join_requests));
reset role;

-- an inactive trip's link is not handed out
update trips set is_active = false where id = '00000000-0000-0000-0000-0000000000a1';
set local role anon; select rls.as_anon();
select rls.check('anon: no token when the trip is not active', public.guest_join_open_token() is null);
reset role;

rollback;
