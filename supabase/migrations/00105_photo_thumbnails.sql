-- Thumbnails for photo grids (egress fix 24/11/2026). The free plan's
-- bandwidth ran out (12.87 of 5.5 GB): grids showed each ~530 KB full photo
-- in a ~130 px tile. Each photo (and each video's poster) now gets a small
-- JPEG next to it in the same private bucket, `<name>.thumb.jpg`, written by
-- the uploading device; older photos get theirs from a parent's device in
-- the background (lib/data/photos.ts backfillThumbnails).
--
-- Security: thumb_path is a column of the same row, so the existing photos
-- policies decide who sees it, and the file sits in the private `photos`
-- bucket under the existing storage policies (00007: owners and kids read,
-- guests never). Guests get a thumbnail only through guest-photos /
-- guest-media, which sign only rows their own RLS returns (approved AND
-- shared, rule 3) - the same check as the full photo. No policy changes.
--
-- Kids may not repoint their row's thumbnail after upload (same as the file
-- and the poster, 00052/00099).
--
-- Rollback: docs/upgrade/migrations/00105_photo_thumbnails.down.sql.

alter table photos add column thumb_path text;

comment on column photos.thumb_path is
  'Small JPEG for grid tiles in the photos bucket (00105); null until made.';

create or replace function public.photos_guard_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.current_member_role() = 'kid' then
    -- new words on an approved photo wait for a parent again (00076)
    new.status := case
      when old.status = 'approved' and new.caption is distinct from old.caption then 'pending'
      else old.status
    end;
    new.shared_with_guests := old.shared_with_guests;
    new.approved_by := old.approved_by;
    new.audience := old.audience;
    -- the file and its ownership are not the kid's to change (00052)
    new.file_path := old.file_path;
    new.trip_id := old.trip_id;
    new.uploaded_by := old.uploaded_by;
    -- nor the day, which is the photo's place (00084)
    new.taken_on := old.taken_on;
    -- nor what kind of file it is (00099)
    new.media_type := old.media_type;
    new.poster_path := old.poster_path;
    new.duration_seconds := old.duration_seconds;
    -- nor its thumbnail (00105)
    new.thumb_path := old.thumb_path;
  end if;
  return new;
end;
$$;
revoke execute on function public.photos_guard_update() from public, anon, authenticated;
