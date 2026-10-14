-- The deny matrix (security pass 14/10/2026): every public table x every role
-- that must not reach the trip's data, x select / insert / update / delete.
-- Generic rows owned by the trip (owner-shaped) are seeded by matrix.sql; the
-- feature probes (43-49) cover what each role IS allowed to do.
begin;
\i scripts/rls/seed.sql
\i scripts/rls/matrix.sql

select rls.check('every public table has RLS enabled',
  not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity));
select rls.check('the matrix seeded a row in every public table',
  (select count(*) from rls_seeded) = (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                                        where n.nspname = 'public' and c.relkind = 'r'));
select rls.check('no policy is a bare "true" for anyone',
  not exists (select 1 from pg_policies where schemaname = 'public' and (qual = 'true' or with_check = 'true')));
select rls.check('members_kid_guest_select matches nothing (00051)',
  (select qual from pg_policies where policyname = 'members_kid_guest_select') = 'false');

-- outsiders of every kind: nothing but global reference data
select rls.check('anon / outsider / revoked guest / other trip''s parent: read nothing of the trip (fx rates are global)',
  not exists (select 1 from rls_matrix where who in ('anon', 'outsider', 'revoked', 'other_owner')
               and op = 'select' and result = 'VISIBLE' and tbl <> 'fx_rates'));
select rls.check('anon / outsider / revoked guest / other trip''s parent: write nothing anywhere',
  not exists (select 1 from rls_matrix where who in ('anon', 'outsider', 'revoked', 'other_owner')
               and op <> 'select' and result = 'ALLOWED'));

-- guests: nothing of the family's own data (photos/stories/episodes/wall need
-- an explicit parent action, covered by probes 43-49)
select rls.check('guest: reads none of the generic family rows (fx rates aside)',
  not exists (select 1 from rls_matrix where who = 'guest' and op = 'select' and result = 'VISIBLE' and tbl <> 'fx_rates'));
select rls.check('guest: cannot write, change or delete a parent''s row anywhere',
  not exists (select 1 from rls_matrix where who = 'guest' and op <> 'select' and result = 'ALLOWED'));

-- kids: the family's day-to-day only; never documents, money, bookings, admin
select rls.check('kid: reads only family day-to-day tables',
  not exists (select 1 from rls_matrix where who = 'kid' and op = 'select' and result = 'VISIBLE'
               and tbl not in ('destination_facts', 'emergency_info', 'fx_rates', 'google_photos',
                               'itinerary_days', 'itinerary_items', 'photos', 'phrasebook_entries')));
select rls.check('kid: cannot write, change or delete a parent''s row anywhere',
  not exists (select 1 from rls_matrix where who = 'kid' and op <> 'select' and result = 'ALLOWED'));
select rls.check('kid: never documents, bookings, expenses, budget, guests list, devices, AI usage',
  not exists (select 1 from rls_matrix where who = 'kid' and result in ('VISIBLE', 'ALLOWED')
               and tbl in ('documents', 'document_pin', 'document_passkeys', 'bookings', 'booking_files', 'expenses',
                           'budget_categories', 'guests_allowlist', 'kid_devices', 'kid_device_registrations', 'ai_usage',
                           'push_subscriptions', 'place_options', 'saved_links', 'visa_requirements')));

-- names, not addresses (00051)
set local role authenticated; select rls.as_guest();
select rls.check('guest: sees no other member''s email', (select count(*) from members where email is not null and id <> '00000000-0000-0000-0000-0000000000b3') = 0);
select rls.check('guest: gets everyone''s name from trip_member_names', (select count(*) from public.trip_member_names('00000000-0000-0000-0000-0000000000a1')) >= 4);
reset role;
set local role authenticated; select rls.as_kid();
select rls.check('kid: sees no member''s email', (select count(*) from members where email is not null) = 0);
select rls.check('kid: gets the names', (select count(*) from public.trip_member_names('00000000-0000-0000-0000-0000000000a1')) >= 4);
reset role;
set local role authenticated; select rls.as_revoked();
select rls.check('revoked guest: no names', (select count(*) from public.trip_member_names('00000000-0000-0000-0000-0000000000a1')) = 0);
reset role;
set local role authenticated; select rls.as_other_owner();
select rls.check('other trip''s parent: no names of this trip', (select count(*) from public.trip_member_names('00000000-0000-0000-0000-0000000000a1')) = 0);
reset role;
select rls.check('anon cannot call trip_member_names', not has_function_privilege('anon', 'public.trip_member_names(uuid)', 'execute'));
set local role authenticated; select rls.as_owner();
select rls.check('owner: still reads guests'' emails (for invitations)', (select count(*) from members where email is not null) >= 3);
reset role;

rollback;
