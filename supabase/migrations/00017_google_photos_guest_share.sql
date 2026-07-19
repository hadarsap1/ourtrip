-- Phase 2 of the Google Photos integration: let the owner share individual
-- imported photos with guests, and surface them on the map.
--
-- Guest visibility mirrors the native photos model (DECISIONS #5): a photo is
-- guest-visible only when the owner explicitly sets shared_with_guests = true.
-- Guests still never read the gphotos bucket directly — the guest-gphotos Edge
-- Function mints short-lived signed URLs (same pattern as guest-photos).
--
-- (map_pin_id already exists from 00016; attaching a photo to a pin is a plain
--  owner UPDATE covered by google_photos_owner_all — no new policy needed.)

create policy google_photos_guest_select on google_photos
  for select using (
    public.is_active_guest_of(trip_id) and shared_with_guests = true
  );
