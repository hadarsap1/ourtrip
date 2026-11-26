-- Thumbnails for imported Google photos (egress, 24/11/2026). Same fix as
-- 00105 for `photos`: the gallery showed every ~1600 px cached copy in a
-- ~130 px tile, and the map popup did the same. Each imported photo now gets
-- a small JPEG next to it in the same private `gphotos` bucket,
-- `<name>.thumb.jpg`: the import function asks Google for a small size at
-- import time (Google's bandwidth, not ours), and older photos get theirs from
-- a parent's device in the background (lib/data/googlePhotos.ts
-- backfillGoogleThumbnails).
--
-- Security: thumb_path is a column of the same row, so the existing
-- google_photos policies decide who sees it (00016/00017: owners all, kids
-- read, guests read only shared_with_guests rows). The file sits in the
-- private `gphotos` bucket under the existing storage policies (00016: owners
-- and kids read, owners write, guests never). Guests get a thumbnail only
-- through guest-gphotos, which signs only rows their own RLS returns - the
-- same check as the full copy. Kids cannot update google_photos at all
-- (select-only policy), so no guard trigger is needed. No policy changes.
--
-- Rollback: docs/upgrade/migrations/00106_gphotos_thumbnails.down.sql.

alter table google_photos add column thumb_path text;

comment on column google_photos.thumb_path is
  'Small JPEG for grid tiles in the gphotos bucket (00106); null until made.';
