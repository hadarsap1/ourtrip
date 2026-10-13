-- Sharing, phase 4 (docs/DESIGN-sharing.md §1): the open blog.
--
-- The first thing in OurTrip readable without signing in, so it is narrow on
-- purpose:
--
--   * only a story with visibility = 'public', status = 'approved' and past
--     its publish_after ("publish after we left") is readable by anyone
--   * only a parent's own story can be public - posts_guard (00043) raises
--     for anything else, for every role
--   * the photos are COPIES. The `photos` bucket stays private and anon has
--     no policy on `photos` at all; a parent's device copies the chosen
--     photos into the separate public `public-stories` bucket when it
--     publishes, and deletes them when it unpublishes. post_photos.public_path
--     points at the copy. A mistake in this file therefore cannot expose any
--     photo that was not deliberately copied out.
--   * no comments and no likes from the public (no anon policy on either)
--   * the page itself is noindex (app/s/[slug])
--
-- Who wrote it is not exposed: anon has no policy on `members`, and the page
-- signs every public story as the family.

create policy posts_public_select on posts
  for select using (
    visibility = 'public'
    and status = 'approved'
    and (publish_after is null or publish_after <= now())
  );

create policy post_photos_public_select on post_photos
  for select using (
    public_path is not null
    and exists (select 1 from posts p where p.id = post_photos.post_id and p.visibility = 'public')
  );

-- ============ STORAGE: public-stories ============

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('public-stories', 'public-stories', true, 5242880, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Reads go through the bucket's public URL (no policy needed, none granted
-- for listing). Writes: owners only.
create policy public_stories_owner_select on storage.objects
  for select using (
    bucket_id = 'public-stories' and public.current_member_role() = 'owner'
  );

create policy public_stories_owner_insert on storage.objects
  for insert with check (
    bucket_id = 'public-stories' and public.current_member_role() = 'owner'
  );

create policy public_stories_owner_update on storage.objects
  for update using (
    bucket_id = 'public-stories' and public.current_member_role() = 'owner'
  ) with check (
    bucket_id = 'public-stories' and public.current_member_role() = 'owner'
  );

create policy public_stories_owner_delete on storage.objects
  for delete using (
    bucket_id = 'public-stories' and public.current_member_role() = 'owner'
  );
