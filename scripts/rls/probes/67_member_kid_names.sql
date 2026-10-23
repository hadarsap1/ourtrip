-- 00067: a guest's kids' names. The guest edits only their own, only that
-- column; parents edit anyone's; everyone on the trip reads them with the
-- names; the join form's names reach the members row on approval.
begin;
\i scripts/rls/seed.sql

-- ---- the guest, on their own tag ----
set local role authenticated; select rls.as_guest();
select rls.check('guest: sets their own tag, trimmed and without repeats',
  public.set_my_kid_names('00000000-0000-0000-0000-0000000000a1', array[' יואב ', 'נועה', 'יואב', '', 'תמר', 'עוד אחד'])
    = array['יואב', 'נועה', 'תמר']);
select rls.check('guest: reads it back with the names',
  (select kid_names from public.trip_member_names('00000000-0000-0000-0000-0000000000a1')
    where id = '00000000-0000-0000-0000-0000000000b3') = array['יואב', 'נועה', 'תמר']);

-- the RPC never touches anyone else, and there is still no UPDATE on members
update members set kid_names = array['x'], display_name = 'Hacked'
 where id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b3');
reset role;
select rls.check('guest: a direct update changed nothing',
  (select display_name from members where id = '00000000-0000-0000-0000-0000000000b3') = 'Guest'
  and (select kid_names from members where id = '00000000-0000-0000-0000-0000000000b3') = array['יואב', 'נועה', 'תמר']
  and (select cardinality(kid_names) from members where id = '00000000-0000-0000-0000-0000000000b1') = 0);

-- ---- others ----
set local role authenticated; select rls.as_kid();
select rls.check('kid: sees the tag with the names',
  (select kid_names from public.trip_member_names('00000000-0000-0000-0000-0000000000a1')
    where id = '00000000-0000-0000-0000-0000000000b3') = array['יואב', 'נועה', 'תמר']);
reset role;
do $$ begin
  set local role authenticated; perform rls.as_kid();
  perform public.set_my_kid_names('00000000-0000-0000-0000-0000000000a1', array['x']);
  raise exception 'FAIL  kid: set_my_kid_names must refuse';
exception when insufficient_privilege then raise notice 'PASS  kid: set_my_kid_names refuses';
end $$;
reset role;
do $$ begin
  set local role authenticated; perform rls.as_revoked();
  perform public.set_my_kid_names('00000000-0000-0000-0000-0000000000a1', array['x']);
  raise exception 'FAIL  revoked guest: set_my_kid_names must refuse';
exception when insufficient_privilege then raise notice 'PASS  revoked guest: set_my_kid_names refuses';
end $$;
reset role;
select rls.check('anon cannot call set_my_kid_names',
  not has_function_privilege('anon', 'public.set_my_kid_names(uuid, text[])', 'execute'));

-- ---- a parent edits a guest's tag ----
set local role authenticated; select rls.as_owner();
update members set kid_names = array['אלה'] where id = '00000000-0000-0000-0000-0000000000b3';
select rls.check('owner: edits a guest''s tag',
  (select kid_names from members where id = '00000000-0000-0000-0000-0000000000b3') = array['אלה']);
reset role;

-- the shape check holds whatever a client sends
do $$ begin
  update members set kid_names = array['a', 'b', 'c', 'd'] where id = '00000000-0000-0000-0000-0000000000b3';
  raise exception 'FAIL  4 kids accepted';
exception when check_violation then raise notice 'PASS  4 kids rejected';
end $$;
do $$ begin
  update members set kid_names = array[repeat('x', 41)] where id = '00000000-0000-0000-0000-0000000000b3';
  raise exception 'FAIL  41-char name accepted';
exception when check_violation then raise notice 'PASS  41-char name rejected';
end $$;
do $$ begin
  update members set kid_names = array[''] where id = '00000000-0000-0000-0000-0000000000b3';
  raise exception 'FAIL  empty name accepted';
exception when check_violation then raise notice 'PASS  empty name rejected';
end $$;

-- ---- the join form, then approval ----
set local role authenticated; select rls.as_owner();
create temp table tok as select public.guest_join_token('00000000-0000-0000-0000-0000000000a1') as t;
grant select on tok to anon, authenticated;
reset role;

set local role anon; select rls.as_anon();
select rls.check('anon: asks with a kid''s name',
  public.submit_guest_join((select t from tok), 'Dana', 'dana@example.com', array[' יואב ']) = 'pending');
select rls.check('anon: an old three-argument call still works',
  public.submit_guest_join((select t from tok), 'Old', 'old@example.com') = 'pending');
reset role;

select rls.check('the request keeps the name',
  (select kid_names from guest_join_requests where email = 'dana@example.com') = array['יואב']);

-- what guest-invite does on approval (service role)
insert into members (trip_id, email, display_name, role)
values ('00000000-0000-0000-0000-0000000000a1', 'dana@example.com', 'Dana', 'guest');
select rls.check('approval: the members row gets the request''s tag',
  (select kid_names from members where email = 'dana@example.com') = array['יואב']);
insert into members (trip_id, email, display_name, role)
values ('00000000-0000-0000-0000-0000000000a1', 'nokids@example.com', 'NoKids', 'guest');
select rls.check('approval without a request: an empty tag',
  (select cardinality(kid_names) from members where email = 'nokids@example.com') = 0);

rollback;
