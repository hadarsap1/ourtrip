-- 00089 (replaces probe 82): an expense is paid in cash, no link to a
-- withdrawal. Still owners only (expenses_owner_all); an old client's link is
-- turned into paid_in_cash; a withdrawal cannot be paid in cash.
begin;
\i scripts/rls/seed.sql

insert into budget_categories (id, trip_id, key, label_he) values
  ('00000000-0000-0000-0000-0000000089c1', '00000000-0000-0000-0000-0000000000a1', 'food', 'אוכל');

-- ---- a parent logs a withdrawal and expenses paid in cash ----
set local role authenticated; select rls.as_owner();
insert into expenses (id, trip_id, category_id, amount, currency, amount_ils, is_cash_withdrawal, created_by) values
  ('00000000-0000-0000-0000-0000000089e1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000089c1',
   10000, 'JPY', 250, true, '00000000-0000-0000-0000-0000000000b1');
insert into expenses (id, trip_id, category_id, amount, currency, amount_ils, paid_in_cash, created_by) values
  ('00000000-0000-0000-0000-0000000089e2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000089c1',
   1200, 'JPY', 30, true, '00000000-0000-0000-0000-0000000000b1');
select rls.check('owner: logs an expense paid in cash',
  (select paid_in_cash from expenses where id = '00000000-0000-0000-0000-0000000089e2'));

-- an app still cached on a phone links to the withdrawal: it becomes paid in cash
insert into expenses (id, trip_id, category_id, amount, currency, amount_ils, paid_from_expense_id, created_by) values
  ('00000000-0000-0000-0000-0000000089e3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000089c1',
   800, 'JPY', 20, '00000000-0000-0000-0000-0000000089e1', '00000000-0000-0000-0000-0000000000b1');
select rls.check('owner: an old client''s link is stored as paid in cash, unlinked',
  (select paid_in_cash and paid_from_expense_id is null from expenses where id = '00000000-0000-0000-0000-0000000089e3'));

do $$ begin
  update expenses set paid_in_cash = true where id = '00000000-0000-0000-0000-0000000089e1';
  raise exception 'FAIL  owner: a withdrawal was marked paid in cash';
exception when check_violation then raise notice 'PASS  owner: a withdrawal cannot be paid in cash';
end $$;
-- a withdrawal can now be unmarked: nothing points at it any more
update expenses set is_cash_withdrawal = false where id = '00000000-0000-0000-0000-0000000089e1';
select rls.check('owner: a withdrawal can be unmarked',
  not (select is_cash_withdrawal from expenses where id = '00000000-0000-0000-0000-0000000089e1'));
update expenses set is_cash_withdrawal = true where id = '00000000-0000-0000-0000-0000000089e1';
reset role;

-- ---- kids and guests see none of it and cannot add to it ----
set local role authenticated; select rls.as_kid();
select rls.check('kid: reads no cash expenses', not exists (select 1 from expenses));
update expenses set paid_in_cash = false;
reset role;
set local role authenticated; select rls.as_guest();
select rls.check('guest: reads no cash expenses', not exists (select 1 from expenses));
update expenses set paid_in_cash = false, is_cash_withdrawal = false;
do $$ begin
  insert into expenses (trip_id, category_id, amount, currency, amount_ils, paid_in_cash, created_by) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000089c1', 1, 'JPY', 1,
     true, '00000000-0000-0000-0000-0000000000b3');
  raise exception 'FAIL  guest: added a cash expense';
exception when insufficient_privilege or check_violation then raise notice 'PASS  guest: cannot add a cash expense';
end $$;
reset role;
select rls.check('kid and guest updates changed nothing',
  (select paid_in_cash from expenses where id = '00000000-0000-0000-0000-0000000089e2')
  and (select is_cash_withdrawal from expenses where id = '00000000-0000-0000-0000-0000000089e1'));

rollback;
