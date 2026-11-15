-- 00096: app_boot answers the opening reads in one call, as the caller. It
-- must give each role exactly what the separate queries gave it.
begin;
\i scripts/rls/seed.sql

insert into itinerary_days (id, trip_id, date, country_code, location_name) values
  ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-0000000000a1', '2030-01-01', 'VN', 'Hoi An');
insert into bookings (id, trip_id, type, title, start_date, end_date, status, cost, confirmation_code) values
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000a1', 'hotel', 'Hotel', '2029-12-30', '2030-01-03', 'paid', 999, 'SECRET1'),
  ('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-0000000000a1', 'attraction', 'Class', '2030-01-01', null, 'booked', 50, 'SECRET2'),
  ('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-0000000000a1', 'attraction', 'Cancelled', '2030-01-01', null, 'cancelled', 1, 'X'),
  ('00000000-0000-0000-0000-00000000e004', '00000000-0000-0000-0000-0000000000a1', 'train', 'Tomorrow', '2030-01-02', null, 'booked', 1, 'Y');
insert into itinerary_items (day_id, title, start_time, status, shared_with_guests, booking_id, sort_order) values
  ('00000000-0000-0000-0000-00000000d001', 'breakfast', '08:00', 'planned', false, null, 1),
  ('00000000-0000-0000-0000-00000000d001', 'class', '14:00', 'planned', true, '00000000-0000-0000-0000-00000000e002', 2),
  ('00000000-0000-0000-0000-00000000d001', 'cancelled thing', '16:00', 'planned', false, '00000000-0000-0000-0000-00000000e003', 3);
insert into photos (trip_id, uploaded_by, file_path, status, shared_with_guests) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'p/kid-pending.jpg', 'pending', false);
insert into guest_join_requests (trip_id, email, display_name) values
  ('00000000-0000-0000-0000-0000000000a1', 'ask@probe.test', 'Asker');
-- another family's trip must never come back
insert into trips (id, name, is_active) values ('00000000-0000-0000-0000-0000000000a2', 'other', false);

select rls.check('anon cannot execute app_boot', not has_function_privilege('anon', 'public.app_boot(date)', 'execute'));
select rls.check('app_boot is security invoker',
  not (select prosecdef from pg_proc where oid = 'public.app_boot(date)'::regprocedure));

set local role authenticated;

select rls.as_owner();
create temp table o as select public.app_boot('2030-01-01') as j;
select rls.check('owner: role, own member row, the trip',
  (select j->>'role' = 'owner' and j->'member'->>'id' = '00000000-0000-0000-0000-0000000000b1'
      and j->'trip'->>'id' = '00000000-0000-0000-0000-0000000000a1' from o));
select rls.check('owner: today''s day and its items, the one tied to a cancelled booking left out, in order',
  (select j->'today'->'day'->>'location_name' = 'Hoi An'
      and jsonb_array_length(j->'today'->'items') = 2
      and j->'today'->'items'->0->>'title' = 'breakfast' and j->'today'->'items'->1->>'title' = 'class' from o));
select rls.check('owner: today''s bookings - the covering range and the single day, not cancelled, not tomorrow',
  (select jsonb_array_length(j->'today'->'bookings') = 2
      and j->'today'->'bookings'->0->>'title' = 'Hotel' and j->'today'->'bookings'->1->>'title' = 'Class' from o));
select rls.check('owner: the waiting counts',
  (select (j->'pending'->>'photos')::int = 1 and (j->'pending'->>'guestRequests')::int = 1
      and (j->'pending'->>'stories')::int = 0 and (j->'pending'->>'episodes')::int = 0 from o));

select rls.as_kid();
-- a kid signs in with a device token carrying member_id and an auth user of
-- their own; the fixture kid has no auth user, so the link answers no role
select rls.check('kid without an auth user: no role, nothing else', public.app_boot('2030-01-01') = '{"role": null}'::jsonb);
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000aa02', 'kid@probe.test');
update members set auth_user_id = '00000000-0000-0000-0000-00000000aa02' where id = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000aa02","member_id":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
create temp table k as select public.app_boot('2030-01-01') as j;
select rls.check('kid: role, the day and its items',
  (select j->>'role' = 'kid' and j->'today'->'day'->>'location_name' = 'Hoi An'
      and jsonb_array_length(j->'today'->'items') >= 2 from k));
select rls.check('kid: no bookings at all - no price, no code',
  (select jsonb_array_length(j->'today'->'bookings') = 0 and j::text !~ 'SECRET' from k));
select rls.check('kid: no join requests in the counts', (select (j->'pending'->>'guestRequests')::int = 0 from k));

select rls.as_guest();
create temp table g as select public.app_boot('2030-01-01') as j;
select rls.check('guest: role and own member row',
  (select j->>'role' = 'guest' and j->'member'->>'id' = '00000000-0000-0000-0000-0000000000b3' from g));
select rls.check('guest: no bookings, no codes, no pending photo, no join requests',
  (select jsonb_array_length(j->'today'->'bookings') = 0 and j::text !~ 'SECRET'
      and (j->'pending'->>'photos')::int = 0 and (j->'pending'->>'guestRequests')::int = 0 from g));
select rls.check('guest: items only as their own policy allows (never the unshared one)',
  (select not exists (select 1 from jsonb_array_elements(j->'today'->'items') e where e->>'title' = 'breakfast') from g));

select rls.as_revoked();
create temp table r as select public.app_boot('2030-01-01') as j;
select rls.check('revoked guest: a role and own row, but no trip, so no day, items, bookings or counts',
  (select j->>'role' = 'guest' and j->'trip' = 'null'::jsonb and not (j ? 'today') and not (j ? 'pending')
      and j::text !~ 'SECRET' and j::text !~ 'Hoi An' from r));

select rls.as_outsider();
select rls.check('outsider: no role and nothing else', public.app_boot('2030-01-01') = '{"role": null}'::jsonb);

rollback;
