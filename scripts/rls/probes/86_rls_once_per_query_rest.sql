-- 00086: the rest of the read policies in once-per-query form. Same access
-- as before (verified at QA 09/11/2026 by recording every identity's visible
-- rows in every public table at 00085, applying 00086 in the same
-- transaction and diffing: no row gained or lost). Here: the access rules on
-- the rewritten tables, and a guard so a new per-row policy is caught.
begin;
\i scripts/rls/seed.sql

-- a second trip, so a leak across trips would show
insert into trips (id, name) values ('00000000-0000-0000-0000-0000000000a2', 'other');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000aa12', 'owner2@probe.test');
insert into members (id, trip_id, auth_user_id, email, display_name, role) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000aa12', 'owner2@probe.test', 'Owner2', 'owner');

insert into itinerary_days (id, trip_id, date, country_code) values
  ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-0000000000a1', '2030-01-01', 'VN'),
  ('00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-0000000000a1', '2030-01-02', 'VN'),
  ('00000000-0000-0000-0000-00000000d003', '00000000-0000-0000-0000-0000000000a2', '2030-01-01', 'VN');
insert into itinerary_items (day_id, title, status, shared_with_guests) values
  ('00000000-0000-0000-0000-00000000d001', 'done shared', 'done', true),
  ('00000000-0000-0000-0000-00000000d001', 'done private', 'done', false),
  ('00000000-0000-0000-0000-00000000d002', 'planned shared', 'planned', true),
  ('00000000-0000-0000-0000-00000000d003', 'other trip', 'done', true);
insert into photos (trip_id, uploaded_by, file_path, status, shared_with_guests) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'p/kid-pending.jpg', 'pending', true),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000e1', 'p/other.jpg', 'approved', true);
insert into phrasebook_entries (trip_id, country_code, language, category, phrase_he, phrase_local) values
  ('00000000-0000-0000-0000-0000000000a1', 'VN', 'vi', 'greet', 'שלום', 'xin chào'),
  ('00000000-0000-0000-0000-0000000000a2', 'VN', 'vi', 'greet', 'תודה', 'cảm ơn');

-- guard: no read policy may call a per-row membership helper on a column
select rls.check('no SELECT / FOR ALL policy calls is_owner_of / is_kid_of / is_active_guest_of in USING',
  not exists (select 1 from pg_policies where schemaname = 'public' and cmd in ('SELECT', 'ALL')
               and qual ~ '(is_owner_of|is_kid_of|is_active_guest_of)\('));
select rls.check('no SELECT / FOR ALL policy calls current_member_id() or auth.uid() bare in USING',
  not exists (select 1 from pg_policies where schemaname = 'public' and cmd in ('SELECT', 'ALL')
               and regexp_replace(qual, '\( SELECT (current_member_id\(\)|auth\.uid\(\)) AS [a-z_]+\)', '', 'g')
                   ~ '(current_member_id|auth\.uid)\(\)'));

set local role authenticated;

select rls.as_owner();
select rls.check('owner: own trip''s days, items, phrases, photos only',
  (select count(*) from itinerary_days) = 2 and (select count(*) from itinerary_items) = 3
  and (select count(*) from phrasebook_entries) = 1 and (select count(*) from photos) = 3
  and (select count(*) from trips) = 1);
insert into itinerary_items (day_id, title) values ('00000000-0000-0000-0000-00000000d002', 'new');
select rls.check('owner: adds an item to own day', (select count(*) from itinerary_items) = 4);
do $$ begin
  insert into itinerary_items (day_id, title) values ('00000000-0000-0000-0000-00000000d003', 'x');
  raise exception 'FAIL  owner: added an item to another trip''s day';
exception when insufficient_privilege then raise notice 'PASS  owner: cannot add an item to another trip''s day';
end $$;
do $$ begin
  insert into phrasebook_entries (trip_id, country_code, language, category, phrase_he, phrase_local)
    values ('00000000-0000-0000-0000-0000000000a2', 'VN', 'vi', 'x', 'x', 'x');
  raise exception 'FAIL  owner: wrote into another trip''s phrasebook';
exception when insufficient_privilege then raise notice 'PASS  owner: cannot write into another trip''s phrasebook';
end $$;

select rls.as_kid();
select rls.check('kid: own trip''s days, items, phrases and every photo; no budget or documents',
  (select count(*) from itinerary_days) = 2 and (select count(*) from itinerary_items) = 4
  and (select count(*) from phrasebook_entries) = 1 and (select count(*) from photos) = 3
  and not exists (select 1 from documents) and not exists (select 1 from expenses)
  and not exists (select 1 from trip_budget));

select rls.as_guest();
select rls.check('guest: only the day with a done + shared item, and only that item',
  (select count(*) from itinerary_days) = 1 and (select count(*) from itinerary_items) = 1
  and (select title from itinerary_items) = 'done shared');
select rls.check('guest (rule 3): only the approved AND shared photo of own trip',
  (select count(*) from photos) = 1
  and (select id from photos) = '00000000-0000-0000-0000-0000000000c1');
select rls.check('guest: no phrasebook, documents or budget; own trip row only',
  not exists (select 1 from phrasebook_entries) and not exists (select 1 from documents)
  and not exists (select 1 from expenses) and (select count(*) from trips) = 1);

select rls.as_revoked();
select rls.check('revoked guest: nothing of the trip',
  not exists (select 1 from trips) and not exists (select 1 from photos)
  and not exists (select 1 from itinerary_days) and not exists (select 1 from itinerary_items));

select rls.as_outsider();
select rls.check('outsider: nothing of the trip',
  not exists (select 1 from trips) and not exists (select 1 from photos)
  and not exists (select 1 from itinerary_days) and not exists (select 1 from phrasebook_entries));

reset role;
set local role anon;
select rls.as_anon();
select rls.check('anon: no trips, photos or days',
  not exists (select 1 from trips) and not exists (select 1 from photos)
  and not exists (select 1 from itinerary_days));

rollback;
