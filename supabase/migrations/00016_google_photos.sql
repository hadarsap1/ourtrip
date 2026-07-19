-- Google Photos integration (SPEC: photos "one-stop shop").
--
-- The owner imports photos from Google Photos through the official Picker API
-- (Google's Library/album-read APIs were shut down for third parties on
-- 2025-03-31 — the Picker is the only sanctioned path). We never mirror the
-- user's whole library; the owner explicitly picks items, and we cache a
-- DISPLAY-SIZED copy (~1600px) in a private bucket so photos render inline and
-- offline. Full-res originals stay in Google Photos (no full duplication).
--
-- Grouping is by free-text country + area (zone / sub-album), consistent with
-- saved_links, so the owners can organize however they like.
--
-- RLS coverage (CLAUDE.md rule #2/#3):
--   * owner: full access (import / edit / delete).
--   * kid: read-only (family viewing) — these are owner-curated photos.
--   * guest: NO access yet. Guest sharing (shared_with_guests + a signed-URL
--     Edge Function, mirroring guest-photos) lands in Phase 2; the column
--     exists now but no guest policy is granted, so guests read zero rows.

create table google_photos (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  google_media_id text not null,   -- Picker mediaItem id; dedup key
  country text,                     -- free-text label (grouping)
  area text,                        -- zone / sub-album within a country
  file_path text not null,          -- cached display image in the 'gphotos' bucket
  filename text,
  width int,
  height int,
  taken_at timestamptz,             -- from the Picker mediaItem createTime
  map_pin_id uuid references map_pins(id) on delete set null,  -- Phase 2: attach-to-place
  shared_with_guests boolean not null default false,           -- Phase 2: guest sharing
  created_by uuid references members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, google_media_id)
);

alter table google_photos enable row level security;

create policy google_photos_owner_all on google_photos
  for all using (public.is_owner_of(trip_id))
  with check (public.is_owner_of(trip_id));

-- Family viewing: kids read owner-curated Google photos (no writes).
create policy google_photos_kid_select on google_photos
  for select using (public.is_kid_of(trip_id));

create trigger google_photos_set_updated_at
  before update on google_photos
  for each row execute function public.set_updated_at();

create index idx_google_photos_trip_id on google_photos(trip_id);
create index idx_google_photos_map_pin_id on google_photos(map_pin_id);
create index idx_google_photos_created_by on google_photos(created_by);

-- ============ STORAGE: gphotos (cached display copies) ============
-- Private bucket. The import Edge Function writes with the service role (RLS
-- bypass); the client reads via signed URLs, so owners + kids need select.
-- Moderation (update/delete) is owner-only. Guests never read this bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gphotos',
  'gphotos',
  false,
  15 * 1024 * 1024, -- 15MB (we request ~1600px from Google; typically < 1MB)
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do nothing;

create policy gphotos_bucket_family_select on storage.objects
  for select using (
    bucket_id = 'gphotos' and public.current_member_role() in ('owner','kid')
  );

create policy gphotos_bucket_owner_insert on storage.objects
  for insert with check (
    bucket_id = 'gphotos' and public.current_member_role() = 'owner'
  );

create policy gphotos_bucket_owner_update on storage.objects
  for update using (
    bucket_id = 'gphotos' and public.current_member_role() = 'owner'
  ) with check (
    bucket_id = 'gphotos' and public.current_member_role() = 'owner'
  );

create policy gphotos_bucket_owner_delete on storage.objects
  for delete using (
    bucket_id = 'gphotos' and public.current_member_role() = 'owner'
  );
