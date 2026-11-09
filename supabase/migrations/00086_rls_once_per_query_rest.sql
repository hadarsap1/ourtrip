-- QA 09/11/2026: "the whole app is slow". Live pg_stat_statements: reading the
-- trip's itinerary_days (230 rows) averaged 372 ms, phrasebook 354 ms; edge
-- logs: most REST reads 250-550 ms at the origin, before the Vietnam ->
-- Frankfurt round trip. EXPLAIN as an owner, rolled back:
--   select * from itinerary_days where trip_id = ...   169 ms (RLS as is)
--   same rows, the rule in the form below              4 ms
--
-- Cause: the same one 00059 fixed for the wall, on every other table.
-- is_owner_of / is_kid_of / is_active_guest_of(trip_id) are SECURITY DEFINER
-- so Postgres cannot inline them, and it calls them once PER ROW, each call a
-- member lookup through current_member_id(). Permissive policies are ORed, so
-- a guest's read of photos also paid photos_owner_all and photos_kid_select
-- per row before reaching its own policy. Realtime re-checks the same RLS for
-- every subscriber on every change.
--
-- Same rules, evaluated once per query (00059's equivalences):
--   is_owner_of(t)        <=> t = (select member_trip_as('owner'))
--   is_kid_of(t)          <=> t = (select member_trip_as('kid'))
--   is_active_guest_of(t) <=> t = (select active_guest_trip())
--   current_member_id()   ->  (select current_member_id())
--   auth.uid()            ->  (select auth.uid())
-- current_member_id() resolves to one member, a member belongs to one trip,
-- and a null (not that role / no member) matches no row, exactly like false.
-- Kid-device revocation and guest allowlist revocation still apply: both
-- helpers go through current_member_id(), and active_guest_trip() keeps the
-- allowlist join with revoked_at is null.
--
-- Scope, as in 00059: USING clauses of SELECT and FOR ALL policies (what every
-- read and realtime check runs), and the WITH CHECK of a FOR ALL policy only
-- where it is the same owner rule as its USING. INSERT / UPDATE / DELETE-only
-- policies touch one row at a time and keep their original functions. No
-- grants change. Who can read or write what does not change; rule 3
-- (photos_guest_select: approved AND shared_with_guests AND group) is kept
-- word for word apart from the guest test.
-- Probes: scripts/rls/probes/86_rls_once_per_query_rest.sql + the full suite.

-- ============ owner-only tables: is_owner_of(trip_id) ============

alter policy bookings_owner_all on bookings
  using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));

alter policy budget_categories_owner_all on budget_categories
  using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));

alter policy checklists_owner_all on checklists
  using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));

alter policy document_passkeys_owner_all on document_passkeys
  using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));

alter policy document_pin_owner_all on document_pin
  using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));

alter policy documents_owner_all on documents
  using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));

alter policy expenses_owner_all on expenses
  using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));

alter policy guest_join_links_owner_all on guest_join_links
  using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));

alter policy guest_join_requests_owner_all on guest_join_requests
  using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));

alter policy guests_allowlist_owner_all on guests_allowlist
  using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));

alter policy map_pins_owner_all on map_pins
  using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));

alter policy members_owner_all on members
  using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));

alter policy pocket_expenses_owner_all on pocket_expenses
  using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));

alter policy pocket_money_owner_all on pocket_money
  using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));

alter policy routes_owner_all on routes
  using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));

alter policy trip_budget_owner_all on trip_budget
  using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));

alter policy visa_requirements_owner_all on visa_requirements
  using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));

alter policy trip_ai_settings_owner_select on trip_ai_settings
  using (trip_id = (select public.member_trip_as('owner')));

-- ============ tables read by owners and kids ============

alter policy destination_facts_owner_all on destination_facts
  using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));
alter policy destination_facts_kid_select on destination_facts
  using (trip_id = (select public.member_trip_as('kid')));

alter policy emergency_info_owner_all on emergency_info
  using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));
alter policy emergency_info_kid_select on emergency_info
  using (trip_id = (select public.member_trip_as('kid')));

alter policy phrasebook_entries_owner_all on phrasebook_entries
  using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));
alter policy phrasebook_entries_kid_select on phrasebook_entries
  using (trip_id = (select public.member_trip_as('kid')));

-- ============ trips (keyed by id) ============

alter policy trips_owner_all on trips
  using (id = (select public.member_trip_as('owner')))
  with check (id = (select public.member_trip_as('owner')));
alter policy trips_kid_select on trips
  using (id = (select public.member_trip_as('kid')));
alter policy trips_guest_select on trips
  using (id = (select public.active_guest_trip()));

-- ============ itinerary ============

alter policy itinerary_days_owner_all on itinerary_days
  using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));
alter policy itinerary_days_kid_select on itinerary_days
  using (trip_id = (select public.member_trip_as('kid')));
alter policy itinerary_days_guest_select on itinerary_days
  using (
    trip_id = (select public.active_guest_trip())
    and public.day_has_guest_visible_item(id)
  );

-- items have no trip_id: day_trip_id(day_id) is the security-definer lookup
-- the guest policy already used (no RLS recursion through itinerary_days)
alter policy itinerary_items_owner_all on itinerary_items
  using (public.day_trip_id(day_id) = (select public.member_trip_as('owner')))
  with check (public.day_trip_id(day_id) = (select public.member_trip_as('owner')));
alter policy itinerary_items_kid_select on itinerary_items
  using (public.day_trip_id(day_id) = (select public.member_trip_as('kid')));
alter policy itinerary_items_guest_select on itinerary_items
  using (
    status = 'done'
    and shared_with_guests = true
    and public.day_trip_id(day_id) = (select public.active_guest_trip())
  );

-- ============ photos (rule 3 unchanged) ============

alter policy photos_owner_all on photos
  using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));
alter policy photos_kid_select on photos
  using (trip_id = (select public.member_trip_as('kid')));
alter policy photos_guest_select on photos
  using (
    trip_id = (select public.active_guest_trip())
    and status = 'approved'
    and shared_with_guests = true
    and (audience = '{}'::text[] or audience && (select public.my_guest_labels()))
  );

alter policy google_photos_owner_all on google_photos
  using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));
alter policy google_photos_kid_select on google_photos
  using (trip_id = (select public.member_trip_as('kid')));
alter policy google_photos_guest_select on google_photos
  using (trip_id = (select public.active_guest_trip()) and shared_with_guests = true);

alter policy post_photos_owner_write on post_photos
  using (public.post_trip_id(post_id) = (select public.member_trip_as('owner')))
  with check (public.post_trip_id(post_id) = (select public.member_trip_as('owner')));

-- ============ views (00085): (select is_x_of(row.trip_id)) is still per row ============

alter policy content_views_owner_select on content_views
  using (trip_id = (select public.member_trip_as('owner')));
alter policy content_views_guest_select on content_views
  using (
    member_id = (select public.current_member_id())
    and trip_id = (select public.active_guest_trip())
  );

-- ============ rows owned through a parent (members / bookings / checklists) ============

alter policy ai_usage_owner_select on ai_usage
  using (exists (select 1 from members m
                  where m.id = ai_usage.member_id
                    and m.trip_id = (select public.member_trip_as('owner'))));

alter policy daily_steps_owner_all on daily_steps
  using (exists (select 1 from members m
                  where m.id = daily_steps.member_id
                    and m.trip_id = (select public.member_trip_as('owner'))))
  with check (exists (select 1 from members m
                  where m.id = daily_steps.member_id
                    and m.trip_id = (select public.member_trip_as('owner'))));

alter policy kid_device_registrations_owner_all on kid_device_registrations
  using (exists (select 1 from members m
                  where m.id = kid_device_registrations.member_id
                    and m.trip_id = (select public.member_trip_as('owner'))))
  with check (exists (select 1 from members m
                  where m.id = kid_device_registrations.member_id
                    and m.trip_id = (select public.member_trip_as('owner'))));

alter policy kid_devices_owner_all on kid_devices
  using (exists (select 1 from members m
                  where m.id = kid_devices.member_id
                    and m.trip_id = (select public.member_trip_as('owner'))))
  with check (exists (select 1 from members m
                  where m.id = kid_devices.member_id
                    and m.trip_id = (select public.member_trip_as('owner'))));

-- WITH CHECK (member_id = current_member_id()) is a different rule: unchanged
alter policy message_reads_owner_all on message_reads
  using (exists (select 1 from members m
                  where m.id = message_reads.member_id
                    and m.trip_id = (select public.member_trip_as('owner'))));

alter policy step_tokens_owner_select on step_tokens
  using (exists (select 1 from members m
                  where m.id = step_tokens.member_id
                    and m.trip_id = (select public.member_trip_as('owner'))));

alter policy booking_files_owner_all on booking_files
  using (exists (select 1 from bookings b
                  where b.id = booking_files.booking_id
                    and b.trip_id = (select public.member_trip_as('owner'))))
  with check (exists (select 1 from bookings b
                  where b.id = booking_files.booking_id
                    and b.trip_id = (select public.member_trip_as('owner'))));

alter policy checklist_items_owner_all on checklist_items
  using (exists (select 1 from checklists c
                  where c.id = checklist_items.checklist_id
                    and c.trip_id = (select public.member_trip_as('owner'))))
  with check (exists (select 1 from checklists c
                  where c.id = checklist_items.checklist_id
                    and c.trip_id = (select public.member_trip_as('owner'))));

-- ============ "own rows": bare current_member_id() / auth.uid() per row ============

alter policy members_self_select on members
  using (auth_user_id = (select auth.uid()) or id = (select public.current_member_id()));

alter policy message_reads_self_all on message_reads
  using (member_id = (select public.current_member_id()));

alter policy push_subscriptions_self_all on push_subscriptions
  using (member_id = (select public.current_member_id()));

alter policy pocket_money_kid_select on pocket_money
  using (kid_id = (select public.current_member_id()));

-- WITH CHECK (also is_kid_of(trip_id)) is one row per write: unchanged
alter policy pocket_expenses_kid_all on pocket_expenses
  using (kid_id = (select public.current_member_id()));

-- 18k rows; the client filters by date, but the check ran per scanned row
alter policy fx_rates_member_select on fx_rates
  using ((select public.current_member_id()) is not null);

-- ============ advisor: foreign keys without a covering index ============

create index if not exists idx_destination_facts_created_by on destination_facts (created_by);
create index if not exists idx_place_options_created_by on place_options (created_by);
