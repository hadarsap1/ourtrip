-- 00091: "הישר לצנצנת". Parents write; kids only read; a guest reads a quote
-- only after a parent shared it; revoked guests, outsiders and anon nothing;
-- only family members of the trip can be named as the speaker.
begin;
\i scripts/rls/seed.sql

-- ---- a parent writes two quotes: one family-only, one shared ----
set local role authenticated; select rls.as_owner();
insert into jar_quotes (id, trip_id, quote, meant, background, said_by, said_by_other, country_code, created_by) values
  ('00000000-0000-0000-0000-0000000091a1', '00000000-0000-0000-0000-0000000000a1', 'probe family', 'probe meant', 'probe bg',
   '{00000000-0000-0000-0000-0000000000b2,00000000-0000-0000-0000-0000000000b1}', '{}', 'JP', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000091a2', '00000000-0000-0000-0000-0000000000a1', 'probe shared', null, null,
   '{00000000-0000-0000-0000-0000000000b2}', '{cousin}', 'TH', '00000000-0000-0000-0000-0000000000b1');
select rls.check('owner: writes quotes', (select count(*) from jar_quotes) = 2);
select rls.check('owner: a new quote is family-only by default',
  (select shared_with_guests from jar_quotes where id = '00000000-0000-0000-0000-0000000091a1') = false);
update jar_quotes set shared_with_guests = true where id = '00000000-0000-0000-0000-0000000091a2';
select rls.check('owner: shares one with guests',
  (select shared_with_guests from jar_quotes where id = '00000000-0000-0000-0000-0000000091a2'));
do $$ begin
  insert into jar_quotes (trip_id, quote, said_by) values
    ('00000000-0000-0000-0000-0000000000a1', 'x', '{00000000-0000-0000-0000-0000000000b3}');
  raise exception 'FAIL  owner: named a guest as the speaker';
exception when check_violation then raise notice 'PASS  owner: a guest cannot be the speaker';
end $$;
do $$ begin
  insert into jar_quotes (trip_id, quote, said_by) values
    ('00000000-0000-0000-0000-0000000000a1', 'x', '{00000000-0000-0000-0000-00000000dead}');
  raise exception 'FAIL  owner: named an unknown member as the speaker';
exception when check_violation then raise notice 'PASS  owner: an unknown id cannot be the speaker';
end $$;
do $$ begin
  insert into jar_quotes (trip_id, quote) values ('00000000-0000-0000-0000-0000000000a1', '   ');
  raise exception 'FAIL  owner: stored an empty quote';
exception when check_violation then raise notice 'PASS  owner: a quote cannot be empty';
end $$;
reset role;

-- ---- a kid reads everything, and only reads ----
set local role authenticated; select rls.as_kid();
select rls.check('kid: reads both quotes, shared or not', (select count(*) from jar_quotes) = 2);
do $$ begin
  insert into jar_quotes (trip_id, quote) values ('00000000-0000-0000-0000-0000000000a1', 'kid');
  raise exception 'FAIL  kid: inserted a quote';
exception when insufficient_privilege then raise notice 'PASS  kid: cannot insert';
end $$;
update jar_quotes set quote = 'kid', shared_with_guests = true;
delete from jar_quotes;
reset role;
select rls.check('kid: update and delete changed nothing',
  (select count(*) from jar_quotes where quote like 'probe%') = 2
  and (select shared_with_guests from jar_quotes where id = '00000000-0000-0000-0000-0000000091a1') = false);

-- ---- a guest reads only the shared one, and cannot change it ----
set local role authenticated; select rls.as_guest();
select rls.check('guest: reads only the shared quote',
  (select array_agg(id) from jar_quotes) = '{00000000-0000-0000-0000-0000000091a2}'::uuid[]);
do $$ begin
  insert into jar_quotes (trip_id, quote) values ('00000000-0000-0000-0000-0000000000a1', 'guest');
  raise exception 'FAIL  guest: inserted a quote';
exception when insufficient_privilege then raise notice 'PASS  guest: cannot insert';
end $$;
update jar_quotes set quote = 'guest';
delete from jar_quotes;
reset role;
select rls.check('guest: update and delete changed nothing', (select count(*) from jar_quotes where quote like 'probe%') = 2);

-- ---- un-sharing hides it again ----
update jar_quotes set shared_with_guests = false where id = '00000000-0000-0000-0000-0000000091a2';
set local role authenticated; select rls.as_guest();
select rls.check('guest: an un-shared quote disappears', not exists (select 1 from jar_quotes));
reset role;

-- ---- revoked guest, outsider, anon: nothing ----
update jar_quotes set shared_with_guests = true;
set local role authenticated; select rls.as_revoked();
select rls.check('revoked guest: reads no quote, even shared', not exists (select 1 from jar_quotes));
reset role;
set local role authenticated; select rls.as_outsider();
select rls.check('outsider: reads no quote', not exists (select 1 from jar_quotes));
reset role;
set local role anon; select rls.as_anon();
select rls.check('anon: reads no quote', not exists (select 1 from jar_quotes));
reset role;

rollback;
