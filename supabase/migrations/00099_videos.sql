-- 00099: short videos in updates (Hadar 17/11/2026).
--
-- A video is a row in `photos` with media_type = 'video'. Nothing about who
-- may see it is new: it is the same row, so every existing policy, trigger
-- and Edge Function check applies to it unchanged -
--   * a kid's upload lands pending and unshared (00001 trigger),
--   * a guest reads it only when status = 'approved' AND
--     shared_with_guests = true, in their groups (hard rule 3, 00063),
--   * guests never read the bucket; guest-photos / guest-media sign only the
--     rows the guest's own RLS returns.
--
-- file_path is the video (MP4, compressed on the device to 720p before the
-- upload - the project is on the Free plan: 50 MB per file, 1 GB in all).
-- poster_path is a JPEG of its first frame in the same private bucket, shown
-- wherever a photo thumbnail is shown; the video itself loads only on play.
--
-- Videos stay inside the app: the open blog's bucket (public-stories, 00046)
-- accepts only image/jpeg and image/webp up to 5 MB, so a video file cannot
-- be copied there, and the client never copies a video's poster either.

alter table photos
  add column media_type text not null default 'image'
    constraint photos_media_type_check check (media_type in ('image', 'video')),
  add column poster_path text,
  add column duration_seconds smallint;

-- "short": up to a minute (one second of slack for container rounding). A
-- photo carries neither a poster nor a length.
alter table photos
  add constraint photos_video_fields_check check (
    case media_type
      when 'video' then duration_seconds is not null and duration_seconds between 0 and 61
      else poster_path is null and duration_seconds is null
    end
  );

-- The private `photos` bucket takes the videos too. 50 MB is the Free plan's
-- ceiling per file; a compressed minute is about 12 MB. Who may read, upload,
-- replace or delete is still 00007 (family reads and uploads, owners
-- moderate) - no storage policy is touched.
update storage.buckets
   set file_size_limit = 52428800, -- 50 MB
       allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp',
         'video/mp4', 'video/quicktime', 'video/webm'
       ]
 where id = 'photos';

-- A kid's update of their own row: same function as 00084 plus the three new
-- columns - what the file is, its poster and its length are not the kid's to
-- change after the upload (a photo cannot be turned into a video in place).
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
  end if;
  return new;
end;
$$;
revoke execute on function public.photos_guard_update() from public, anon, authenticated;
