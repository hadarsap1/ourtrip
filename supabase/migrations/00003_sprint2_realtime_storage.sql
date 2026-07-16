-- Sprint 2: realtime + booking attachments storage.
--
-- RLS coverage for this sprint's features (all pre-existing from 00001):
--   itinerary_days_owner_all, itinerary_items_owner_all, bookings_owner_all,
--   expenses_owner_all, budget_categories_owner_all.
-- New policies below cover ONLY the booking-files storage bucket.

-- ============ REALTIME ============
-- postgres_changes events for the itinerary + bookings screens. Subscribers
-- are authorized against the tables' RLS policies (owner-only for now).

alter publication supabase_realtime add table public.itinerary_days;
alter publication supabase_realtime add table public.itinerary_items;
alter publication supabase_realtime add table public.bookings;

-- ============ STORAGE: booking-files (owners only) ============
-- Private bucket; files are opened via short-lived signed URLs, which also
-- require passing the SELECT policy below.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'booking-files',
  'booking-files',
  false,
  20 * 1024 * 1024, -- 20MB
  array['application/pdf','image/jpeg','image/png','image/webp','image/heic']
)
on conflict (id) do nothing;

create policy booking_files_owner_select on storage.objects
  for select using (
    bucket_id = 'booking-files' and public.current_member_role() = 'owner'
  );

create policy booking_files_owner_insert on storage.objects
  for insert with check (
    bucket_id = 'booking-files' and public.current_member_role() = 'owner'
  );

create policy booking_files_owner_update on storage.objects
  for update using (
    bucket_id = 'booking-files' and public.current_member_role() = 'owner'
  ) with check (
    bucket_id = 'booking-files' and public.current_member_role() = 'owner'
  );

create policy booking_files_owner_delete on storage.objects
  for delete using (
    bucket_id = 'booking-files' and public.current_member_role() = 'owner'
  );
