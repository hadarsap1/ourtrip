-- 00053: the monthly AI budget. Only a parent reserves; the daily cap and the
-- monthly budget refuse; only the service role records cost; the budget is
-- owner-only.
begin;
\i scripts/rls/seed.sql

-- ---- reserve as a parent ----
set local role authenticated; select rls.as_owner();
select rls.check('owner: first reserve is ok and names the member',
  (select r->>'ok' = 'true' and r->>'member_id' = '00000000-0000-0000-0000-0000000000b1' and (r->>'calls_left_today')::int = 1
     from (select public.ai_reserve('recommend', 2) as r) x));
select rls.check('owner: second reserve under a cap of 2 is ok', (public.ai_reserve('recommend', 2))->>'ok' = 'true');
select rls.check('owner: third reserve hits the daily cap', (public.ai_reserve('recommend', 2))->>'reason' = 'ai_daily_limit');
select rls.check('owner: the cap is per function', (public.ai_reserve('translate-phrase', 2))->>'ok' = 'true');
reset role;
select rls.check('reserves are counted in ai_usage',
  (select calls from ai_usage where member_id = '00000000-0000-0000-0000-0000000000b1' and fn = 'recommend') = 2);

-- ---- other roles cannot reserve ----
set local role authenticated; select rls.as_kid();
select rls.check('kid: reserve is forbidden', (public.ai_reserve('recommend', 50))->>'reason' = 'forbidden');
reset role;
set local role authenticated; select rls.as_guest();
select rls.check('guest: reserve is forbidden', (public.ai_reserve('recommend', 50))->>'reason' = 'forbidden');
reset role;
set local role authenticated; select rls.as_outsider();
select rls.check('outsider: reserve is forbidden', (public.ai_reserve('recommend', 50))->>'reason' = 'forbidden');
reset role;
select rls.check('anon cannot call ai_reserve; only the service role can call ai_record',
  not has_function_privilege('anon', 'public.ai_reserve(text, integer)', 'execute')
  and not has_function_privilege('anon', 'public.ai_record(uuid, text, bigint, bigint, numeric)', 'execute')
  and not has_function_privilege('authenticated', 'public.ai_record(uuid, text, bigint, bigint, numeric)', 'execute')
  and has_function_privilege('service_role', 'public.ai_record(uuid, text, bigint, bigint, numeric)', 'execute'));

-- ---- the monthly budget ----
-- last month's spend does not count
insert into ai_usage (member_id, fn, day, calls, cost_usd) values
  ('00000000-0000-0000-0000-0000000000b1', 'gmail-bookings', (date_trunc('month', now() at time zone 'utc') - interval '1 day')::date, 1, 50);
set local role authenticated; select rls.as_owner();
select rls.check('owner: last month''s spend is not this month''s', (public.ai_reserve('facts-generate', 10))->>'ok' = 'true');
reset role;

-- record as the service role: $9.99 this month, still under the default $10
set local role service_role;
select public.ai_record('00000000-0000-0000-0000-0000000000b1', 'facts-generate', 1000, 500, 9.99);
reset role;
select rls.check('ai_record adds tokens and cost to today''s row',
  (select input_tokens = 1000 and output_tokens = 500 and cost_usd = 9.99 and calls = 1 from ai_usage
    where member_id = '00000000-0000-0000-0000-0000000000b1' and fn = 'facts-generate' and day = (now() at time zone 'utc')::date));
set local role authenticated; select rls.as_owner();
select rls.check('owner: $9.99 of $10 still reserves', (public.ai_reserve('facts-generate', 10))->>'ok' = 'true');
reset role;
set local role service_role;
select public.ai_record('00000000-0000-0000-0000-0000000000b1', 'facts-generate', 10, 10, 0.02);
select public.ai_record('00000000-0000-0000-0000-0000000000b1', 'facts-generate', 10, 10, -5);
reset role;
select rls.check('a negative cost is recorded as zero',
  (select cost_usd = 10.01 from ai_usage
    where member_id = '00000000-0000-0000-0000-0000000000b1' and fn = 'facts-generate' and day = (now() at time zone 'utc')::date));
set local role authenticated; select rls.as_owner();
select rls.check('owner: $10.01 of $10 is refused for every function',
  (public.ai_reserve('recommend', 99))->>'reason' = 'ai_budget' and (public.ai_reserve('booking-paste', 99))->>'reason' = 'ai_budget');

-- a parent raises the budget, and AI runs again
insert into trip_ai_settings (trip_id, monthly_budget_usd) values ('00000000-0000-0000-0000-0000000000a1', 20);
select rls.check('owner: after raising to $20 it reserves again', (public.ai_reserve('booking-paste', 99))->>'ok' = 'true');
select rls.check('owner: reads the budget', (select monthly_budget_usd from trip_ai_settings) = 20);
update trip_ai_settings set monthly_budget_usd = 15, updated_by = '00000000-0000-0000-0000-0000000000b2';
reset role;
select rls.check('updated_by is stamped with the parent who changed it, not taken from the client',
  (select updated_by = '00000000-0000-0000-0000-0000000000b1' and monthly_budget_usd = 15 from trip_ai_settings));
do $$ begin
  update trip_ai_settings set monthly_budget_usd = 201;
  raise exception 'FAIL  a budget over $200 was accepted';
exception when check_violation then raise notice 'PASS  a budget over $200 is rejected';
end $$;

-- ---- kids and guests never see or change the budget ----
set local role authenticated; select rls.as_kid();
select rls.check('kid: sees no budget, no usage', (select count(*) from trip_ai_settings) = 0 and (select count(*) from ai_usage) = 0);
update trip_ai_settings set monthly_budget_usd = 200;
reset role;
set local role authenticated; select rls.as_guest();
select rls.check('guest: sees no budget, no usage', (select count(*) from trip_ai_settings) = 0 and (select count(*) from ai_usage) = 0);
update trip_ai_settings set monthly_budget_usd = 200;
do $$ begin
  insert into trip_ai_settings (trip_id, monthly_budget_usd) values ('00000000-0000-0000-0000-0000000000a1', 200)
    on conflict (trip_id) do update set monthly_budget_usd = 200;
  raise exception 'FAIL  guest upserted the budget';
exception when insufficient_privilege then raise notice 'PASS  guest: cannot upsert the budget';
end $$;
reset role;
select rls.check('kid and guest updates changed nothing', (select monthly_budget_usd from trip_ai_settings) = 15);

rollback;
