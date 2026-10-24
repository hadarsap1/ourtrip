-- 00061: guest groups are a list, owner-managed, invisible to everyone else.
begin;
\i scripts/rls/seed.sql

set local role authenticated;

-- owner: puts a guest in two groups
select rls.as_owner();
update guests_allowlist set labels = array['כיתה עומר', 'כיתה אלה']
 where email = 'guest@probe.test';
select rls.check('owner: guest is in two groups',
  (select labels from guests_allowlist where email = 'guest@probe.test') = array['כיתה עומר', 'כיתה אלה']);

-- guest: cannot read the allowlist's groups, cannot change them
select rls.as_guest();
select rls.check('guest: sees no group of anyone',
  not exists (select 1 from guests_allowlist where cardinality(labels) > 0));
update guests_allowlist set labels = '{}' where email = 'guest@probe.test';
select rls.as_owner();
select rls.check('guest: update did not touch the groups',
  (select cardinality(labels) from guests_allowlist where email = 'guest@probe.test') = 2);

-- kid: the same
select rls.as_kid();
select rls.check('kid: sees no group of anyone',
  not exists (select 1 from guests_allowlist where cardinality(labels) > 0));
update guests_allowlist set labels = '{}' where email = 'guest@probe.test';
select rls.as_owner();
select rls.check('kid: update did not touch the groups',
  (select cardinality(labels) from guests_allowlist where email = 'guest@probe.test') = 2);

-- the shape check holds whatever the client sends
do $$ begin
  update guests_allowlist set labels = array[''] where email = 'guest@probe.test';
  raise exception 'FAIL  empty group name accepted';
exception when check_violation then raise notice 'PASS  empty group name rejected';
end $$;
do $$ begin
  update guests_allowlist set labels = array[repeat('x', 41)] where email = 'guest@probe.test';
  raise exception 'FAIL  41-char group accepted';
exception when check_violation then raise notice 'PASS  41-char group rejected';
end $$;
do $$ begin
  update guests_allowlist set labels = array_fill('x'::text, array[11]) where email = 'guest@probe.test';
  raise exception 'FAIL  11 groups accepted';
exception when check_violation then raise notice 'PASS  11 groups rejected';
end $$;
do $$ begin
  update guests_allowlist set labels = array[null::text] where email = 'guest@probe.test';
  raise exception 'FAIL  null group accepted';
exception when check_violation then raise notice 'PASS  null group rejected';
end $$;
reset role;

rollback;
