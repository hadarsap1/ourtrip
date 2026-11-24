-- 00107: home_dashboard answers the parents' home in one call, as the caller.
-- Each role must get exactly what the separate queries gave it: budget,
-- expenses and steps are a parent's only (00042 and the budget policies).
begin;
\i scripts/rls/seed.sql

insert into itinerary_days (id, trip_id, date, country_code, location_name) values
  ('00000000-0000-0000-0000-00000000d101', '00000000-0000-0000-0000-0000000000a1', '2029-12-20', 'TH', 'Bangkok'),
  ('00000000-0000-0000-0000-00000000d102', '00000000-0000-0000-0000-0000000000a1', '2029-12-21', 'VN', 'Hanoi'),
  ('00000000-0000-0000-0000-00000000d103', '00000000-0000-0000-0000-0000000000a1', '2030-01-01', 'VN', 'Hoi An');
insert into budget_categories (id, trip_id, key, label_he, planned_amount) values
  ('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-0000000000a1', 'food', 'אוכל', 1000);
insert into trip_budget (trip_id, total_budget) values ('00000000-0000-0000-0000-0000000000a1', 50000);
insert into expenses (trip_id, category_id, amount, currency, amount_ils, spent_on, created_by, description) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000c101', 10, 'ILS', 10, '2030-01-01',
   '00000000-0000-0000-0000-0000000000b1', 'SECRETNOTE');
insert into daily_steps (member_id, date, steps) values
  ('00000000-0000-0000-0000-0000000000b1', '2030-01-01', 9000),
  ('00000000-0000-0000-0000-0000000000b1', '2029-12-22', 7000),
  ('00000000-0000-0000-0000-0000000000b1', '2029-12-19', 1);

select rls.check('anon cannot execute home_dashboard',
  not has_function_privilege('anon', 'public.home_dashboard(date, date)', 'execute'));
select rls.check('home_dashboard is security invoker',
  not (select prosecdef from pg_proc where oid = 'public.home_dashboard(date, date)'::regprocedure));

set local role authenticated;

select rls.as_owner();
create temp table o as select public.home_dashboard('2030-01-01', '2029-12-26') as j;
select rls.check('owner: the trip, its categories, the total and the expense',
  (select j->>'trip_id' = '00000000-0000-0000-0000-0000000000a1'
      and jsonb_array_length(j->'categories') = 1 and (j->>'total_budget')::numeric = 50000
      and jsonb_array_length(j->'expenses') = 1 from o));
select rls.check('owner: expenses carry only the totals columns (no description)',
  (select j::text !~ 'SECRETNOTE' from o));
select rls.check('owner: steps reach back to the start of the Vietnam stay, not before it',
  (select j->>'steps_from' = '2029-12-21' and jsonb_array_length(j->'steps') = 2 from o));

select rls.as_guest();
create temp table g as select public.home_dashboard('2030-01-01', '2029-12-26') as j;
select rls.check('guest: no categories, no total, no expenses, no steps',
  (select jsonb_array_length(j->'categories') = 0 and j->'total_budget' = 'null'::jsonb
      and jsonb_array_length(j->'expenses') = 0 and jsonb_array_length(j->'steps') = 0 from g));

select rls.as_kid();
create temp table k as select public.home_dashboard('2030-01-01', '2029-12-26') as j;
select rls.check('kid: no budget and no steps either',
  (select jsonb_array_length(j->'categories') = 0 and jsonb_array_length(j->'expenses') = 0
      and jsonb_array_length(j->'steps') = 0 from k));

select rls.as_outsider();
select rls.check('outsider: nothing of the trip',
  (select coalesce(jsonb_array_length(j->'expenses'), 0) = 0 from (select public.home_dashboard('2030-01-01', '2029-12-26') j) x));

rollback;
