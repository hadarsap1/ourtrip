-- 00082: cash withdrawals and purchases paid from them. Still owners only
-- (expenses_owner_all); the guard keeps every link pointing at a withdrawal
-- of the same trip.
begin;
\i scripts/rls/seed.sql

insert into trips (id, name) values ('00000000-0000-0000-0000-0000000000a2', 'other trip');
insert into budget_categories (id, trip_id, key, label_he) values
  ('00000000-0000-0000-0000-0000000082c1', '00000000-0000-0000-0000-0000000000a1', 'food', 'אוכל'),
  ('00000000-0000-0000-0000-0000000082c2', '00000000-0000-0000-0000-0000000000a2', 'food', 'אוכל');
-- a withdrawal on the other trip, inserted as superuser
insert into members (id, trip_id, display_name, role) values
  ('00000000-0000-0000-0000-0000000082b9', '00000000-0000-0000-0000-0000000000a2', 'Other', 'owner');
insert into expenses (id, trip_id, category_id, amount, currency, amount_ils, is_cash_withdrawal, created_by) values
  ('00000000-0000-0000-0000-0000000082e9', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000082c2',
   500, 'ILS', 500, true, '00000000-0000-0000-0000-0000000082b9');

-- ---- a parent logs a withdrawal and a purchase paid from it ----
set local role authenticated; select rls.as_owner();
insert into expenses (id, trip_id, category_id, amount, currency, amount_ils, is_cash_withdrawal, created_by) values
  ('00000000-0000-0000-0000-0000000082e1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000082c1',
   3000, 'ILS', 3000, true, '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000082e3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000082c1',
   50, 'ILS', 50, false, '00000000-0000-0000-0000-0000000000b1');
insert into expenses (id, trip_id, category_id, amount, currency, amount_ils, paid_from_expense_id, created_by) values
  ('00000000-0000-0000-0000-0000000082e2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000082c1',
   1000, 'ILS', 1000, '00000000-0000-0000-0000-0000000082e1', '00000000-0000-0000-0000-0000000000b1');
select rls.check('owner: logs a purchase paid from a withdrawal',
  (select paid_from_expense_id from expenses where id = '00000000-0000-0000-0000-0000000082e2')
    = '00000000-0000-0000-0000-0000000082e1');

do $$ begin
  update expenses set paid_from_expense_id = '00000000-0000-0000-0000-0000000082e3'
    where id = '00000000-0000-0000-0000-0000000082e2';
  raise exception 'FAIL  owner: linked a purchase to an expense that is not a withdrawal';
exception when check_violation then raise notice 'PASS  owner: cannot link to an expense that is not a withdrawal';
end $$;
do $$ begin
  update expenses set paid_from_expense_id = '00000000-0000-0000-0000-0000000082e9'
    where id = '00000000-0000-0000-0000-0000000082e2';
  raise exception 'FAIL  owner: linked a purchase to another trip''s withdrawal';
exception when check_violation then raise notice 'PASS  owner: cannot link to another trip''s withdrawal';
end $$;
do $$ begin
  update expenses set is_cash_withdrawal = false where id = '00000000-0000-0000-0000-0000000082e1';
  raise exception 'FAIL  owner: unmarked a withdrawal that still has purchases';
exception when check_violation then raise notice 'PASS  owner: a withdrawal with purchases stays one';
end $$;
do $$ begin
  update expenses set is_cash_withdrawal = true where id = '00000000-0000-0000-0000-0000000082e2';
  raise exception 'FAIL  owner: a purchase paid from cash became a withdrawal itself';
exception when check_violation then raise notice 'PASS  owner: a purchase paid from cash cannot be a withdrawal';
end $$;
reset role;

-- ---- kids and guests see none of it and cannot add to it ----
set local role authenticated; select rls.as_kid();
select rls.check('kid: reads no withdrawals or purchases', not exists (select 1 from expenses));
update expenses set paid_from_expense_id = null;
reset role;
set local role authenticated; select rls.as_guest();
select rls.check('guest: reads no withdrawals or purchases', not exists (select 1 from expenses));
update expenses set is_cash_withdrawal = false;
do $$ begin
  insert into expenses (trip_id, category_id, amount, currency, amount_ils, paid_from_expense_id, created_by) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000082c1', 1, 'ILS', 1,
     '00000000-0000-0000-0000-0000000082e1', '00000000-0000-0000-0000-0000000000b3');
  raise exception 'FAIL  guest: added a purchase to a withdrawal';
exception when insufficient_privilege or check_violation then raise notice 'PASS  guest: cannot add a purchase to a withdrawal';
end $$;
reset role;
select rls.check('kid and guest updates changed nothing',
  (select paid_from_expense_id from expenses where id = '00000000-0000-0000-0000-0000000082e2')
    = '00000000-0000-0000-0000-0000000082e1'
  and (select is_cash_withdrawal from expenses where id = '00000000-0000-0000-0000-0000000082e1'));

-- ---- deleting the withdrawal leaves the purchase as an ordinary expense ----
set local role authenticated; select rls.as_owner();
delete from expenses where id = '00000000-0000-0000-0000-0000000082e1';
select rls.check('owner: deleting a withdrawal keeps its purchase, unlinked',
  (select paid_from_expense_id is null from expenses where id = '00000000-0000-0000-0000-0000000082e2'));
reset role;

rollback;
