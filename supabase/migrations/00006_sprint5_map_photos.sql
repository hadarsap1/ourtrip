-- Sprint 5: storage for where's-the-car photos (SPEC 2.7).
--
-- RLS coverage for this sprint's features (all pre-existing from 00001):
--   map_pins_owner_all, routes_owner_all, phrasebook_entries_owner_all,
--   itinerary policies for weather/map reads. New policies below cover ONLY
--   the map-photos storage bucket (owner-only, same pattern as 00003/00005).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'map-photos',
  'map-photos',
  false,
  10 * 1024 * 1024, -- 10MB
  array['image/jpeg','image/png','image/webp','image/heic']
)
on conflict (id) do nothing;

create policy map_photos_owner_select on storage.objects
  for select using (
    bucket_id = 'map-photos' and public.current_member_role() = 'owner'
  );

create policy map_photos_owner_insert on storage.objects
  for insert with check (
    bucket_id = 'map-photos' and public.current_member_role() = 'owner'
  );

create policy map_photos_owner_update on storage.objects
  for update using (
    bucket_id = 'map-photos' and public.current_member_role() = 'owner'
  ) with check (
    bucket_id = 'map-photos' and public.current_member_role() = 'owner'
  );

create policy map_photos_owner_delete on storage.objects
  for delete using (
    bucket_id = 'map-photos' and public.current_member_role() = 'owner'
  );
