-- Load test (100 readers on the wall, likes and comments): the hot read
-- policies called is_owner_of / is_kid_of / is_active_guest_of(trip_id) once
-- PER ROW, and a guest's read ORs all three, so every row paid three member
-- lookups. reactions/comments also ran feedback_target_visible() per row, a
-- query on posts/episodes under their own RLS. Measured on a copy with 100
-- members, as one guest: 480 likes 1628 ms, 300 wall messages 300 ms, 96
-- comments 314 ms. Realtime runs the same check for every subscriber on
-- every change.
--
-- Same rules, evaluated once per query instead of once per row:
--   * member_trip_as(role) / active_guest_trip() return the caller's trip for
--     that role (or null). current_member_id() resolves to one member, so
--       is_owner_of(t)        <=> t = member_trip_as('owner')
--       is_kid_of(t)          <=> t = member_trip_as('kid')
--       is_active_guest_of(t) <=> t = active_guest_trip()
--     and wrapped in (select ...) Postgres runs them once (an InitPlan). A
--     null (not that role) matches no row, exactly like false. Kid device
--     revocation still applies: both go through current_member_id().
--   * feedback_target_visible(trip_id, post_id, episode_id) - "the target is a
--     post/episode of this trip that the caller can see" - becomes a row IN
--     (select id, trip_id from posts|episodes), uncorrelated, so it is hashed
--     once; posts/episodes RLS still applies inside it (it is not security
--     definer), as it did inside the function.
--
-- Only USING clauses of reads (and the owners' FOR ALL) change. INSERT checks
-- are one row each and keep the original functions. No grant changes beyond
-- the two new helpers. Probes: scripts/rls/probes/59_rls_once_per_query.sql
-- plus the full suite, unchanged and passing.

create or replace function public.member_trip_as(p_role member_role)
returns uuid
language sql stable security definer set search_path = public
as $$
  select m.trip_id from members m
   where m.id = public.current_member_id() and m.role = p_role
   limit 1;
$$;

create or replace function public.active_guest_trip()
returns uuid
language sql stable security definer set search_path = public
as $$
  select m.trip_id
    from members m
    join guests_allowlist g
      on g.trip_id = m.trip_id and lower(g.email) = lower(m.email)
   where m.id = public.current_member_id()
     and m.role = 'guest'
     and g.revoked_at is null
   limit 1;
$$;

-- anon too: the owners' FOR ALL policies apply to every role, and an anon read
-- of a public story evaluates them (both return null without a member, like
-- the is_*_of functions they stand in for, which anon could always run)
revoke execute on function public.member_trip_as(member_role) from public;
revoke execute on function public.active_guest_trip() from public;
grant execute on function public.member_trip_as(member_role) to anon, authenticated;
grant execute on function public.active_guest_trip() to anon, authenticated;

-- ============ messages (the wall) ============

alter policy messages_owner_all on messages
  using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));

alter policy messages_kid_select on messages
  using (
    trip_id = (select public.member_trip_as('kid'))
    and channel = 'guests'
    and (approved_at is not null or sender_id = (select public.current_member_id()))
  );

alter policy messages_kid_delete_pending on messages
  using (
    trip_id = (select public.member_trip_as('kid'))
    and sender_id = (select public.current_member_id())
    and approved_at is null
  );

alter policy messages_guest_select on messages
  using (
    trip_id = (select public.active_guest_trip())
    and channel = 'guests'
    and approved_at is not null
  );

-- ============ stories and episodes (feedback targets) ============

alter policy posts_owner_all on posts
  using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));

alter policy posts_kid_select on posts
  using (
    trip_id = (select public.member_trip_as('kid'))
    and (status = 'approved' or author_id = (select public.current_member_id()))
  );

alter policy posts_guest_select on posts
  using (
    trip_id = (select public.active_guest_trip())
    and status = 'approved'
    and visibility in ('guests', 'public')
    and (publish_after is null or publish_after <= now())
  );

alter policy episodes_owner_all on episodes
  using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));

alter policy episodes_kid_select on episodes
  using (trip_id = (select public.member_trip_as('kid')) and status = 'approved');

alter policy episodes_guest_select on episodes
  using (
    trip_id = (select public.active_guest_trip())
    and status = 'approved'
    and shared_with_guests = true
  );

-- ============ likes and comments ============

-- reactions_owner_all's WITH CHECK (own name, visible target) is unchanged
alter policy reactions_owner_all on reactions
  using (trip_id = (select public.member_trip_as('owner')));

alter policy reactions_member_select on reactions
  using (
    trip_id in (select public.member_trip_as('kid') union all select public.active_guest_trip())
    and case
      when post_id is not null then (post_id, trip_id) in (select p.id, p.trip_id from posts p)
      else (episode_id, trip_id) in (select e.id, e.trip_id from episodes e)
    end
  );

alter policy comments_owner_all on comments
  using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));

alter policy comments_guest_select on comments
  using (
    trip_id = (select public.active_guest_trip())
    and case
      when post_id is not null then (post_id, trip_id) in (select p.id, p.trip_id from posts p)
      else (episode_id, trip_id) in (select e.id, e.trip_id from episodes e)
    end
  );

alter policy comments_kid_select on comments
  using (
    trip_id = (select public.member_trip_as('kid'))
    and case
      when post_id is not null then (post_id, trip_id) in (select p.id, p.trip_id from posts p)
      else (episode_id, trip_id) in (select e.id, e.trip_id from episodes e)
    end
  );
