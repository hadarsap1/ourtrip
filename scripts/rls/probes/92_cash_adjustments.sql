-- 00092: hand corrections of the cash wallet. Owners only
-- (cash_adjustments_owner_all): kids and guests read and write nothing, and
-- an owner cannot write to another trip.
begin;
\i scripts/rls/seed.sql

insert into trips (id, name) values ('00000000-0000-0000-0000-0000000000a2', 'other trip');

-- ---- a parent sets the wallet, and undoes it ----
set local role authenticated; select rls.as_owner();
insert into cash_adjustments (id, trip_id, currency, balance, delta, created_by) values
  ('00000000-0000-0000-0000-0000000092a1', '00000000-0000-0000-0000-0000000000a1', 'VND', 45000000, -2130000,
   '00000000-0000-0000-0000-0000000000b1');
select rls.check('owner: sets the cash wallet by hand',
  (select balance from cash_adjustments where id = '00000000-0000-0000-0000-0000000092a1') = 45000000);
do $$ begin
  insert into cash_adjustments (trip_id, currency, balance, delta) values
    ('00000000-0000-0000-0000-0000000000a2', 'VND', 1, 1);
  raise exception 'FAIL  owner: wrote a correction to another trip';
exception when insufficient_privilege or check_violation then raise notice 'PASS  owner: cannot write to another trip';
end $$;
do $$ begin
  insert into cash_adjustments (trip_id, currency, balance, delta) values
    ('00000000-0000-0000-0000-0000000000a1', 'VND', -5, 0);
  raise exception 'FAIL  owner: a negative balance was saved';
exception when check_violation then raise notice 'PASS  owner: a balance below zero is refused';
end $$;
do $$ begin
  insert into cash_adjustments (trip_id, currency, balance, delta) values
    ('00000000-0000-0000-0000-0000000000a1', 'dong', 5, 0);
  raise exception 'FAIL  owner: a currency that is not three capital letters was saved';
exception when check_violation then raise notice 'PASS  owner: the currency must be three capital letters';
end $$;
reset role;

-- ---- kids and guests see none of it and cannot change it ----
set local role authenticated; select rls.as_kid();
select rls.check('kid: reads no cash corrections', not exists (select 1 from cash_adjustments));
update cash_adjustments set balance = 0;
delete from cash_adjustments;
do $$ begin
  insert into cash_adjustments (trip_id, currency, balance, delta) values
    ('00000000-0000-0000-0000-0000000000a1', 'VND', 1, 1);
  raise exception 'FAIL  kid: added a cash correction';
exception when insufficient_privilege or check_violation then raise notice 'PASS  kid: cannot add a cash correction';
end $$;
reset role;
set local role authenticated; select rls.as_guest();
select rls.check('guest: reads no cash corrections', not exists (select 1 from cash_adjustments));
update cash_adjustments set balance = 0;
delete from cash_adjustments;
do $$ begin
  insert into cash_adjustments (trip_id, currency, balance, delta) values
    ('00000000-0000-0000-0000-0000000000a1', 'VND', 1, 1);
  raise exception 'FAIL  guest: added a cash correction';
exception when insufficient_privilege or check_violation then raise notice 'PASS  guest: cannot add a cash correction';
end $$;
reset role;
select rls.check('kid and guest changed nothing',
  (select balance from cash_adjustments where id = '00000000-0000-0000-0000-0000000092a1') = 45000000);

set local role authenticated; select rls.as_owner();
delete from cash_adjustments where id = '00000000-0000-0000-0000-0000000092a1';
select rls.check('owner: undoes a correction', not exists (select 1 from cash_adjustments));
reset role;

rollback;
