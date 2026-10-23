-- 00069: one fact for everyone on the trip - the country of the day the
-- family is living now - and nothing else about the itinerary.
begin;
\i scripts/rls/seed.sql

-- yesterday and today in Israel terms; "today" here is the family's date in
-- Japan (UTC+9), so pick the day that is current in Tokyo
insert into itinerary_days (trip_id, date, country_code, location_name) values
  ('00000000-0000-0000-0000-0000000000a1', (now() at time zone 'Asia/Tokyo')::date - 1, 'VN', 'Hanoi'),
  ('00000000-0000-0000-0000-0000000000a1', (now() at time zone 'Asia/Tokyo')::date, 'JP', 'Tokyo'),
  ('00000000-0000-0000-0000-0000000000a1', (now() at time zone 'Asia/Tokyo')::date + 1, 'GE', 'Tbilisi');

set local role authenticated;
select rls.as_guest();
select rls.check('guest: gets the country of the family''s today',
  public.trip_now_country('00000000-0000-0000-0000-0000000000a1') = 'JP');
select rls.check('guest: still reads no itinerary day (no done, shared item)',
  not exists (select 1 from itinerary_days));
select rls.as_kid();
select rls.check('kid: gets it too', public.trip_now_country('00000000-0000-0000-0000-0000000000a1') = 'JP');
select rls.as_owner();
select rls.check('owner: gets it too', public.trip_now_country('00000000-0000-0000-0000-0000000000a1') = 'JP');
select rls.as_revoked();
select rls.check('revoked guest: nothing', public.trip_now_country('00000000-0000-0000-0000-0000000000a1') is null);
select rls.as_outsider();
select rls.check('outsider: nothing', public.trip_now_country('00000000-0000-0000-0000-0000000000a1') is null);
reset role;
select rls.check('anon cannot call trip_now_country',
  not has_function_privilege('anon', 'public.trip_now_country(uuid)', 'execute'));

-- no day for today (before the trip, a gap) -> nothing to show
delete from itinerary_days where country_code = 'JP';
set local role authenticated; select rls.as_guest();
select rls.check('guest: no day today -> null',
  public.trip_now_country('00000000-0000-0000-0000-0000000000a1') is null);
reset role;

select rls.check('unknown country falls back to Israel''s zone', public.country_time_zone('ZZ') = 'Asia/Jerusalem');
select rls.check('zone lookup ignores case', public.country_time_zone('vn') = 'Asia/Ho_Chi_Minh');

rollback;
