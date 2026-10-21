-- 00060: mark_wall_read marks only what the caller may read, only for themself.
begin;
\i scripts/rls/seed.sql

-- a second trip with its own wall
insert into trips (id, name) values ('00000000-0000-0000-0000-0000000000a2', 'other');
insert into members (id, trip_id, display_name, role) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a2', 'Owner2', 'owner');

-- the wall: owner's, guest's, a kid's pending one, the retired family
-- channel, and the other trip's
select rls.as_owner();
insert into messages (id, trip_id, sender_id, body, channel) values
  ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'owner', 'guests'),
  ('00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'family', 'family'),
  ('00000000-0000-0000-0000-000000000603', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', 'guest', 'guests'),
  ('00000000-0000-0000-0000-000000000604', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000e1', 'other trip', 'guests');
select rls.as_kid();
insert into messages (id, trip_id, sender_id, body, channel) values
  ('00000000-0000-0000-0000-000000000605', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'kid pending', 'guests');

-- guest: marks the owner's message only (own skipped, pending kid one and
-- other trips invisible); a second call marks nothing new
set local role authenticated; select rls.as_guest();
-- (call and check in separate statements: a check in the same statement
-- would read the snapshot from before the insert)
create temp table marked (n int) on commit drop;
grant all on marked to authenticated, anon;
insert into marked select public.mark_wall_read('00000000-0000-0000-0000-0000000000a1');
select rls.check('guest: marks only visible messages of others',
  (select n from marked) = 1
  and (select array_agg(message_id) from message_reads) = array['00000000-0000-0000-0000-000000000601'::uuid]);
select rls.check('guest: a second call marks nothing new',
  public.mark_wall_read('00000000-0000-0000-0000-0000000000a1') = 0);
select rls.check('guest: another trip''s wall marks nothing',
  public.mark_wall_read('00000000-0000-0000-0000-0000000000a2') = 0);
reset role;
select rls.check('guest: every read row is the guest''s own',
  not exists (select 1 from message_reads where member_id <> '00000000-0000-0000-0000-0000000000b3'));

-- kid: sees the guest's and owner's, plus own pending (own is skipped)
set local role authenticated; select rls.as_kid();
select rls.check('kid: marks the two others'' messages',
  public.mark_wall_read('00000000-0000-0000-0000-0000000000a1') = 2);
reset role;

-- revoked guest and outsider: nothing; anon cannot call it at all
set local role authenticated; select rls.as_revoked();
select rls.check('revoked guest: marks nothing', public.mark_wall_read('00000000-0000-0000-0000-0000000000a1') = 0);
select rls.as_outsider();
select rls.check('outsider: marks nothing', public.mark_wall_read('00000000-0000-0000-0000-0000000000a1') = 0);
reset role;
set local role anon; select rls.as_anon();
do $$ begin
  perform public.mark_wall_read('00000000-0000-0000-0000-0000000000a1');
  raise exception 'FAIL  anon called mark_wall_read';
exception when insufficient_privilege then raise notice 'PASS  anon: cannot call mark_wall_read';
end $$;
reset role;

rollback;
