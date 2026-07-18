-- Post-Sprint-8 hardening: cover foreign keys with indexes (performance
-- advisor `unindexed_foreign_keys`). Cheap, idempotent, and keeps joins and
-- cascade/anti-join lookups fast as trip data grows. PK/unique columns are
-- already indexed and are omitted.

create index if not exists idx_members_trip_id on members(trip_id);

create index if not exists idx_kid_devices_member_id on kid_devices(member_id);
create index if not exists idx_kid_devices_approved_by on kid_devices(approved_by);
create index if not exists idx_kid_device_registrations_member_id on kid_device_registrations(member_id);
create index if not exists idx_kid_device_registrations_created_by on kid_device_registrations(created_by);

create index if not exists idx_itinerary_days_trip_id on itinerary_days(trip_id);
create index if not exists idx_itinerary_items_day_id on itinerary_items(day_id);
create index if not exists idx_itinerary_items_booking_id on itinerary_items(booking_id);

create index if not exists idx_bookings_trip_id on bookings(trip_id);
create index if not exists idx_budget_categories_trip_id on budget_categories(trip_id);

create index if not exists idx_expenses_trip_id on expenses(trip_id);
create index if not exists idx_expenses_category_id on expenses(category_id);
create index if not exists idx_expenses_booking_id on expenses(booking_id);
create index if not exists idx_expenses_created_by on expenses(created_by);

create index if not exists idx_documents_trip_id on documents(trip_id);

create index if not exists idx_journal_entries_trip_id on journal_entries(trip_id);
create index if not exists idx_journal_entries_author_id on journal_entries(author_id);

create index if not exists idx_photos_trip_id on photos(trip_id);
create index if not exists idx_photos_uploaded_by on photos(uploaded_by);
create index if not exists idx_photos_journal_entry_id on photos(journal_entry_id);
create index if not exists idx_photos_approved_by on photos(approved_by);

create index if not exists idx_messages_trip_id on messages(trip_id);
create index if not exists idx_messages_sender_id on messages(sender_id);
create index if not exists idx_message_reads_member_id on message_reads(member_id);
create index if not exists idx_message_reads_message_id on message_reads(message_id);

create index if not exists idx_guests_allowlist_trip_id on guests_allowlist(trip_id);
create index if not exists idx_guests_allowlist_invited_by on guests_allowlist(invited_by);

create index if not exists idx_map_pins_trip_id on map_pins(trip_id);
create index if not exists idx_map_pins_created_by on map_pins(created_by);

create index if not exists idx_routes_trip_id on routes(trip_id);
create index if not exists idx_routes_day_id on routes(day_id);
create index if not exists idx_routes_created_by on routes(created_by);

create index if not exists idx_checklists_trip_id on checklists(trip_id);
create index if not exists idx_checklists_source_template_id on checklists(source_template_id);
create index if not exists idx_checklist_items_checklist_id on checklist_items(checklist_id);
create index if not exists idx_checklist_items_assigned_to on checklist_items(assigned_to);

create index if not exists idx_pocket_money_trip_id on pocket_money(trip_id);
create index if not exists idx_pocket_money_kid_id on pocket_money(kid_id);
create index if not exists idx_pocket_expenses_trip_id on pocket_expenses(trip_id);
create index if not exists idx_pocket_expenses_kid_id on pocket_expenses(kid_id);

create index if not exists idx_emergency_info_trip_id on emergency_info(trip_id);
create index if not exists idx_phrasebook_entries_trip_id on phrasebook_entries(trip_id);

create index if not exists idx_saved_recommendations_trip_id on saved_recommendations(trip_id);
create index if not exists idx_saved_recommendations_created_by on saved_recommendations(created_by);

create index if not exists idx_push_subscriptions_member_id on push_subscriptions(member_id);
