-- Emoji on comments and on wall messages (Hadar 23/11/2026). The same four
-- kinds as on updates, episodes and photos (00045, 00077). Everyone who can
-- see a comment or a message can react to it - kids included, though kids
-- still cannot write comments (00050).
--
--   comment_id  a comment on an update, episode or photo
--   message_id  a message on the wall; only an approved one (a kid's waiting
--               message cannot be reacted to, as it cannot be answered, 00066)
--
-- Visibility is the caller's own RLS, as before ("you can react to what you
-- can see"): comments_*_select and messages_*_select decide. A guest who
-- cannot see a message (another group's, 00063) cannot see or add its likes.
-- Deleting a comment or a message deletes its likes.

-- ============ COLUMNS ============

alter table reactions add column comment_id uuid references comments(id) on delete cascade;
alter table reactions add column message_id uuid references messages(id) on delete cascade;

alter table reactions drop constraint reactions_one_target;
alter table reactions add constraint reactions_one_target
  check (num_nonnulls(post_id, episode_id, photo_id, comment_id, message_id) = 1);

create index idx_reactions_comment_id on reactions(comment_id);
create index idx_reactions_message_id on reactions(message_id);
create unique index reactions_once_per_comment
  on reactions(member_id, comment_id, kind) where comment_id is not null;
create unique index reactions_once_per_message
  on reactions(member_id, message_id, kind) where message_id is not null;

-- ============ VISIBILITY ============

-- Not security definer, on purpose (as feedback_target_visible): the lookups
-- run under the caller's RLS.
create or replace function public.reaction_target_visible(
  p_trip_id uuid, p_post_id uuid, p_episode_id uuid, p_photo_id uuid,
  p_comment_id uuid, p_message_id uuid
)
returns boolean
language sql stable security invoker set search_path = public
as $$
  select case
    when p_comment_id is not null then
      exists (select 1 from comments c where c.id = p_comment_id and c.trip_id = p_trip_id)
    when p_message_id is not null then
      exists (
        select 1 from messages m
         where m.id = p_message_id and m.trip_id = p_trip_id and m.approved_at is not null
      )
    else
      public.feedback_target_visible(p_trip_id, p_post_id, p_episode_id, p_photo_id)
  end;
$$;
-- callable by the policies' roles, like feedback_target_visible: it is
-- security invoker, so it shows nobody anything their own RLS hides

-- ============ POLICIES ============

alter policy reactions_owner_all on reactions
  with check (
    public.is_owner_of(trip_id)
    and member_id = public.current_member_id()
    and public.reaction_target_visible(trip_id, post_id, episode_id, photo_id, comment_id, message_id)
  );

alter policy reactions_member_insert on reactions
  with check (
    (public.is_kid_of(trip_id) or public.is_active_guest_of(trip_id))
    and member_id = public.current_member_id()
    and public.reaction_target_visible(trip_id, post_id, episode_id, photo_id, comment_id, message_id)
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
      when photo_id is not null then (photo_id, trip_id) in (select ph.id, ph.trip_id from photos ph)
      when comment_id is not null then (comment_id, trip_id) in (select c.id, c.trip_id from comments c)
      else (message_id, trip_id) in (select m.id, m.trip_id from messages m)
    end
  );
