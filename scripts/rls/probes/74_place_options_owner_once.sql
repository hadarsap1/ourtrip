-- 00074: place_options_owner_all in once-per-query form. Same access as
-- before: the owner of this trip only, and the country-code trigger still
-- fills the code from the trip's own options.
begin;
\i scripts/rls/seed.sql

-- a second trip, so a leak across trips would show
insert into trips (id, name) values ('00000000-0000-0000-0000-0000000000a2', 'other');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000aa12', 'owner2@probe.test');
insert into members (id, trip_id, auth_user_id, email, display_name, role) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000aa12', 'owner2@probe.test', 'Owner2', 'owner');
insert into place_options (trip_id, title, country, country_code) values
  ('00000000-0000-0000-0000-0000000000a1', 'mine', 'יפן', 'JP'),
  ('00000000-0000-0000-0000-0000000000a2', 'theirs', 'יפן', 'XX');

set local role authenticated;
select rls.as_owner();
select rls.check('owner: reads own trip''s options only',
  (select count(*) from place_options) = 1 and exists (select 1 from place_options where title = 'mine'));
insert into place_options (trip_id, title, country) values ('00000000-0000-0000-0000-0000000000a1', 'new', 'יפן');
select rls.check('owner: insert gets the code from own trip, not the other one',
  (select country_code from place_options where title = 'new') = 'JP');
do $$ begin
  insert into place_options (trip_id, title) values ('00000000-0000-0000-0000-0000000000a2', 'x');
  raise exception 'FAIL  owner into another trip: inserted an option';
exception when insufficient_privilege then raise notice 'PASS  owner into another trip: cannot insert an option';
end $$;
select rls.as_kid();
select rls.check('kid: reads nothing', not exists (select 1 from place_options));
do $$ begin
  insert into place_options (trip_id, title) values ('00000000-0000-0000-0000-0000000000a1', 'x');
  raise exception 'FAIL  kid: inserted an option';
exception when insufficient_privilege then raise notice 'PASS  kid: cannot insert an option';
end $$;
select rls.as_guest();
select rls.check('guest: reads nothing', not exists (select 1 from place_options));
do $$ begin
  insert into place_options (trip_id, title) values ('00000000-0000-0000-0000-0000000000a1', 'x');
  raise exception 'FAIL  guest: inserted an option';
exception when insufficient_privilege then raise notice 'PASS  guest: cannot insert an option';
end $$;
select rls.as_outsider();
select rls.check('outsider: reads nothing', not exists (select 1 from place_options));

rollback;
