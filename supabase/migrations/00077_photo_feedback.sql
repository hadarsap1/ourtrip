-- Likes and comments on photos (Hadar 30/10/2026).
--
-- Same rules as stories (00045, 00050): guests and parents comment, kids read
-- the comments without writing; everyone who can see the photo can like it.
-- A comment or like hangs off exactly one of a story, an episode or a photo.
--
-- RULE 3. "Can see the photo" is the caller's own RLS on photos, so a guest
-- can comment on, like, and read the feedback of a photo only while it is
-- approved, shared and in their audience (photos_guest_select). A photo a
-- guest cannot see has no comments a guest can see either.
--
-- feedback_target_visible gains the photo, as a 4-argument function; every
-- policy that used the 3-argument one moves to it, and the old one is dropped
-- (the drop fails if anything still depends on it). The select policies keep
-- the once-per-query form from 00059.

-- ============ COLUMNS ============

alter table comments add column photo_id uuid references photos(id) on delete cascade;
alter table reactions add column photo_id uuid references photos(id) on delete cascade;

alter table comments drop constraint comments_check;
alter table comments add constraint comments_one_target
  check (num_nonnulls(post_id, episode_id, photo_id) = 1);
alter table reactions drop constraint reactions_check;
alter table reactions add constraint reactions_one_target
  check (num_nonnulls(post_id, episode_id, photo_id) = 1);

create index idx_comments_photo_id on comments(photo_id, created_at);
create index idx_reactions_photo_id on reactions(photo_id);
create unique index reactions_once_per_photo
  on reactions(member_id, photo_id, kind) where photo_id is not null;

-- ============ VISIBILITY ============

-- Not security definer, on purpose (as before): the lookups run under the
-- caller's RLS, so "you can react to what you can see".
create or replace function public.feedback_target_visible(
  p_trip_id uuid, p_post_id uuid, p_episode_id uuid, p_photo_id uuid
)
returns boolean
language sql stable security invoker set search_path = public
as $$
  select case
    when p_post_id is not null then
      exists (select 1 from posts p where p.id = p_post_id and p.trip_id = p_trip_id)
    when p_episode_id is not null then
      exists (select 1 from episodes e where e.id = p_episode_id and e.trip_id = p_trip_id)
    else
      exists (select 1 from photos ph where ph.id = p_photo_id and ph.trip_id = p_trip_id)
  end;
$$;

-- ============ POLICIES ============

alter policy reactions_owner_all on reactions
  with check (
    public.is_owner_of(trip_id)
    and member_id = public.current_member_id()
    and public.feedback_target_visible(trip_id, post_id, episode_id, photo_id)
  );

alter policy reactions_member_insert on reactions
  with check (
    (public.is_kid_of(trip_id) or public.is_active_guest_of(trip_id))
    and member_id = public.current_member_id()
    and public.feedback_target_visible(trip_id, post_id, episode_id, photo_id)
  );

alter policy reactions_member_select on reactions
  using (
    trip_id in (
      select public.member_trip_as('kid'::member_role)
      union all
      select public.active_guest_trip()
    )
    and case
      when post_id is not null then (post_id, trip_id) in (select p.id, p.trip_id from posts p)
      when episode_id is not null then (episode_id, trip_id) in (select e.id, e.trip_id from episodes e)
      else (photo_id, trip_id) in (select ph.id, ph.trip_id from photos ph)
    end
  );

alter policy comments_guest_insert on comments
  with check (
    public.is_active_guest_of(trip_id)
    and author_id = public.current_member_id()
    and shown_to_kids_at is null
    and shown_by is null
    and public.feedback_target_visible(trip_id, post_id, episode_id, photo_id)
  );

alter policy comments_guest_select on comments
  using (
    trip_id = (select public.active_guest_trip())
    and case
      when post_id is not null then (post_id, trip_id) in (select p.id, p.trip_id from posts p)
      when episode_id is not null then (episode_id, trip_id) in (select e.id, e.trip_id from episodes e)
      else (photo_id, trip_id) in (select ph.id, ph.trip_id from photos ph)
    end
  );

alter policy comments_kid_select on comments
  using (
    trip_id = (select public.member_trip_as('kid'::member_role))
    and case
      when post_id is not null then (post_id, trip_id) in (select p.id, p.trip_id from posts p)
      when episode_id is not null then (episode_id, trip_id) in (select e.id, e.trip_id from episodes e)
      else (photo_id, trip_id) in (select ph.id, ph.trip_id from photos ph)
    end
  );

drop function public.feedback_target_visible(uuid, uuid, uuid);

-- a guest editing a comment cannot move it to another photo (00076)
create or replace function public.comments_edit_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.current_member_role() is distinct from 'owner' then
    new.trip_id := old.trip_id;
    new.author_id := old.author_id;
    new.post_id := old.post_id;
    new.episode_id := old.episode_id;
    new.photo_id := old.photo_id;
    new.created_at := old.created_at;
    new.shown_to_kids_at := old.shown_to_kids_at;
    new.shown_by := old.shown_by;
  end if;
  return new;
end;
$$;
revoke execute on function public.comments_edit_guard() from public, anon, authenticated;
