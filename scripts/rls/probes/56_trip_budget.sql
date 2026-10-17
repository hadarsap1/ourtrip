-- 00056: the overall trip budget is owner-only. It used to be trips.total_budget,
-- which every member can read (QA 17/10/2026).
begin;
\i scripts/rls/seed.sql

select rls.check('trips no longer carries the budget',
  not exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'trips' and column_name = 'total_budget'));

-- ---- a parent sets, reads, changes and clears it ----
set local role authenticated; select rls.as_owner();
insert into trip_budget (trip_id, total_budget) values ('00000000-0000-0000-0000-0000000000a1', 180000);
select rls.check('owner: reads the budget', (select total_budget from trip_budget) = 180000);
update trip_budget set total_budget = 150000 where trip_id = '00000000-0000-0000-0000-0000000000a1';
select rls.check('owner: changes the budget', (select total_budget from trip_budget) = 150000);
reset role;

-- ---- nobody else sees it, or can change it ----
set local role authenticated; select rls.as_kid();
select rls.check('kid: cannot read the budget', not exists (select 1 from trip_budget));
update trip_budget set total_budget = 1;
reset role;
set local role authenticated; select rls.as_guest();
select rls.check('guest: cannot read the budget', not exists (select 1 from trip_budget));
update trip_budget set total_budget = 1;
reset role;
set local role authenticated; select rls.as_revoked();
select rls.check('revoked guest: cannot read the budget', not exists (select 1 from trip_budget));
reset role;
set local role authenticated; select rls.as_outsider();
select rls.check('outsider: cannot read the budget', not exists (select 1 from trip_budget));
reset role;
select rls.check('kid and guest updates changed nothing', (select total_budget from trip_budget) = 150000);

set local role authenticated; select rls.as_kid();
do $$ begin
  insert into trip_budget (trip_id, total_budget) values ('00000000-0000-0000-0000-0000000000a1', 1)
    on conflict (trip_id) do update set total_budget = 1;
  raise exception 'FAIL  kid: wrote the budget';
exception when insufficient_privilege then raise notice 'PASS  kid: cannot write the budget';
end $$;
reset role;

select rls.check('anon has no privileges on trip_budget',
  not has_table_privilege('anon', 'public.trip_budget', 'select'));

set local role authenticated; select rls.as_owner();
delete from trip_budget where trip_id = '00000000-0000-0000-0000-0000000000a1';
select rls.check('owner: clearing the budget removes the row', not exists (select 1 from trip_budget));
reset role;

rollback;
