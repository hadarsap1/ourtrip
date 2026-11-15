-- 00089: the country card of "הידעת". Owners write, kids only read, guests
-- see nothing; one card per country per trip.
begin;
\i scripts/rls/seed.sql

-- ---- a parent writes the card ----
set local role authenticated; select rls.as_owner();
insert into country_profiles (id, trip_id, country_code, flag_meaning, population)
  values ('00000000-0000-0000-0000-0000000089c1', '00000000-0000-0000-0000-0000000000a1', 'JP', 'probe flag', 'probe pop');
select rls.check('owner: writes a country card', exists (select 1 from country_profiles where country_code = 'JP'));
update country_profiles set capital = 'probe capital' where id = '00000000-0000-0000-0000-0000000089c1';
select rls.check('owner: edits it', (select capital from country_profiles where id = '00000000-0000-0000-0000-0000000089c1') = 'probe capital');
do $$ begin
  insert into country_profiles (trip_id, country_code) values ('00000000-0000-0000-0000-0000000000a1', 'JP');
  raise exception 'FAIL  owner: two cards for one country';
exception when unique_violation then raise notice 'PASS  owner: one card per country';
end $$;
do $$ begin
  insert into country_profiles (trip_id, country_code) values ('00000000-0000-0000-0000-0000000000a1', 'japan');
  raise exception 'FAIL  owner: stored a country that is not an ISO code';
exception when check_violation then raise notice 'PASS  owner: country must be two capital letters';
end $$;
reset role;

-- ---- a kid reads, and only reads ----
set local role authenticated; select rls.as_kid();
select rls.check('kid: reads the card', (select count(*) from country_profiles) = 1);
do $$ begin
  insert into country_profiles (trip_id, country_code) values ('00000000-0000-0000-0000-0000000000a1', 'TH');
  raise exception 'FAIL  kid: inserted a card';
exception when insufficient_privilege then raise notice 'PASS  kid: cannot insert';
end $$;
update country_profiles set flag_meaning = 'kid' ;
delete from country_profiles;
reset role;
select rls.check('kid: update and delete changed nothing',
  (select flag_meaning from country_profiles where id = '00000000-0000-0000-0000-0000000089c1') = 'probe flag');

-- ---- guests and anon see nothing ----
set local role authenticated; select rls.as_guest();
select rls.check('guest: reads no card', not exists (select 1 from country_profiles));
update country_profiles set flag_meaning = 'guest';
reset role;
set local role anon; select rls.as_anon();
select rls.check('anon: reads no card', not exists (select 1 from country_profiles));
reset role;
select rls.check('guest update changed nothing',
  (select flag_meaning from country_profiles where id = '00000000-0000-0000-0000-0000000089c1') = 'probe flag');

rollback;
