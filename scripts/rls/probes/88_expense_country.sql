-- 00088: an expense's own country. Still owners only (expenses_owner_all);
-- the code must be two capital letters or nothing.
begin;
\i scripts/rls/seed.sql

insert into budget_categories (id, trip_id, key, label_he) values
  ('00000000-0000-0000-0000-0000000088c1', '00000000-0000-0000-0000-0000000000a1', 'lodging', 'לינה');
insert into expenses (id, trip_id, category_id, amount, currency, amount_ils, created_by) values
  ('00000000-0000-0000-0000-0000000088e1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000088c1',
   1000, 'ILS', 1000, '00000000-0000-0000-0000-0000000000b1');

-- ---- a parent sets and clears the country ----
set local role authenticated; select rls.as_owner();
update expenses set country_code = 'JP' where id = '00000000-0000-0000-0000-0000000088e1';
select rls.check('owner: sets an expense''s country',
  (select country_code from expenses where id = '00000000-0000-0000-0000-0000000088e1') = 'JP');
do $$ begin
  update expenses set country_code = 'japan' where id = '00000000-0000-0000-0000-0000000088e1';
  raise exception 'FAIL  owner: stored a country that is not an ISO code';
exception when check_violation then raise notice 'PASS  owner: country must be two capital letters';
end $$;
update expenses set country_code = null where id = '00000000-0000-0000-0000-0000000088e1';
select rls.check('owner: clears the country back to automatic',
  (select country_code from expenses where id = '00000000-0000-0000-0000-0000000088e1') is null);
update expenses set country_code = 'JP' where id = '00000000-0000-0000-0000-0000000088e1';
reset role;

-- ---- kids and guests neither see nor change it ----
set local role authenticated; select rls.as_kid();
select rls.check('kid: reads no expense countries', not exists (select 1 from expenses));
update expenses set country_code = 'VN';
reset role;
set local role authenticated; select rls.as_guest();
select rls.check('guest: reads no expense countries', not exists (select 1 from expenses));
update expenses set country_code = 'VN';
reset role;
select rls.check('kid and guest updates changed nothing',
  (select country_code from expenses where id = '00000000-0000-0000-0000-0000000088e1') = 'JP');

rollback;
