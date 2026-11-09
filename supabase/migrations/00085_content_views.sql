-- Who of the guests saw an update, opened a photo or played an episode, and
-- how much of the episode they heard (Hadar 09/11/2026: "can I see in the app
-- how many people saw an update / a photo / played the podcast?").
--
-- Decided with Hadar: guests only, with names, one row per guest and item
-- (a guest who opened it five times is one person), views made offline are
-- kept on the device and sent later, and guests are told nothing.
--   update  - its card was at least half on screen for 2 seconds (the feed
--             has no separate page to open)
--   photo   - opened in the photo sheet
--   episode - play pressed; heard_seconds is the furthest point reached by
--             listening (a jump forward does not count as heard)
--
-- RLS:
--   * a guest records only their own view, only while an active guest, and
--     only of something their own RLS lets them see (feedback_target_visible
--     runs as the caller). RULE 3: a photo that is not approved AND shared
--     cannot be recorded, because the guest cannot see it.
--   * a guest reads back only their own rows (ON CONFLICT DO UPDATE needs it);
--     nobody but a parent reads anyone else's.
--   * parents read every row of their trip. They do not write: parents' and
--     kids' views are not counted.
--   * kids, outsiders and anon: nothing.
--   * after insert only the times and heard_seconds can change (column
--     grants), so a row cannot be moved to another member or target.

create table content_views (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  post_id uuid references posts(id) on delete cascade,
  photo_id uuid references photos(id) on delete cascade,
  episode_id uuid references episodes(id) on delete cascade,
  first_viewed_at timestamptz not null default now(),
  last_viewed_at timestamptz not null default now(),
  heard_seconds int not null default 0,
  constraint content_views_one_target check (num_nonnulls(post_id, photo_id, episode_id) = 1),
  constraint content_views_heard_range check (heard_seconds between 0 and 86400),
  constraint content_views_heard_episode_only check (heard_seconds = 0 or episode_id is not null)
);

comment on table content_views is
  'Guests'' views of updates, photos and episodes (00085). Guests write their '
  'own, parents read the trip''s. Never kids.';

create unique index content_views_once_per_post
  on content_views(member_id, post_id) where post_id is not null;
create unique index content_views_once_per_photo
  on content_views(member_id, photo_id) where photo_id is not null;
create unique index content_views_once_per_episode
  on content_views(member_id, episode_id) where episode_id is not null;
create index idx_content_views_trip on content_views(trip_id);
create index idx_content_views_post on content_views(post_id);
create index idx_content_views_photo on content_views(photo_id);
create index idx_content_views_episode on content_views(episode_id);

alter table content_views enable row level security;

create policy content_views_owner_select on content_views
  for select
  using ((select public.is_owner_of(trip_id)));

create policy content_views_guest_select on content_views
  for select
  using (
    member_id = (select public.current_member_id())
    and (select public.is_active_guest_of(trip_id))
  );

create policy content_views_guest_insert on content_views
  for insert
  with check (
    member_id = (select public.current_member_id())
    and public.is_active_guest_of(trip_id)
    and public.feedback_target_visible(trip_id, post_id, episode_id, photo_id)
  );

create policy content_views_guest_update on content_views
  for update
  using (
    member_id = (select public.current_member_id())
    and (select public.is_active_guest_of(trip_id))
  )
  with check (
    member_id = (select public.current_member_id())
    and public.is_active_guest_of(trip_id)
    and public.feedback_target_visible(trip_id, post_id, episode_id, photo_id)
  );

-- anon never touches it (Supabase grants new tables to anon by default)
revoke all on content_views from anon;
grant select on content_views to authenticated;
grant insert (trip_id, member_id, post_id, photo_id, episode_id, first_viewed_at, last_viewed_at, heard_seconds)
  on content_views to authenticated;
grant update (first_viewed_at, last_viewed_at, heard_seconds) on content_views to authenticated;

-- ============ RECORDING ============

-- One call per view, from the guest's device (now or when it is back online).
-- Security invoker: the target lookup and the write both run under the
-- caller's RLS. Something the caller cannot see, or a caller who is not an
-- active guest, records nothing and is not an error - a view queued offline
-- of a photo that was unshared since must not fail forever.
-- p_at is when it was seen on the device: never in the future, never more
-- than 30 days back. Heard time never goes down and never passes the
-- episode's length.
create or replace function public.record_content_view(
  p_post_id uuid default null,
  p_photo_id uuid default null,
  p_episode_id uuid default null,
  p_heard_seconds int default 0,
  p_at timestamptz default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_trip uuid;
  v_member uuid := public.current_member_id();
  v_at timestamptz := least(now(), greatest(coalesce(p_at, now()), now() - interval '30 days'));
  v_heard int := greatest(0, least(coalesce(p_heard_seconds, 0), 86400));
  v_length int;
begin
  if num_nonnulls(p_post_id, p_photo_id, p_episode_id) <> 1 or v_member is null then
    return;
  end if;

  if p_post_id is not null then
    select trip_id into v_trip from posts where id = p_post_id;
  elsif p_photo_id is not null then
    select trip_id into v_trip from photos where id = p_photo_id;
  else
    select trip_id, duration_seconds into v_trip, v_length from episodes where id = p_episode_id;
  end if;

  if v_trip is null or not public.is_active_guest_of(v_trip) then
    return;
  end if;

  if p_episode_id is null then
    v_heard := 0;
  elsif v_length is not null then
    v_heard := least(v_heard, v_length);
  end if;

  if p_post_id is not null then
    insert into content_views as cv (trip_id, member_id, post_id, first_viewed_at, last_viewed_at)
    values (v_trip, v_member, p_post_id, v_at, v_at)
    on conflict (member_id, post_id) where post_id is not null do update
      set first_viewed_at = least(cv.first_viewed_at, excluded.first_viewed_at),
          last_viewed_at = greatest(cv.last_viewed_at, excluded.last_viewed_at);
  elsif p_photo_id is not null then
    insert into content_views as cv (trip_id, member_id, photo_id, first_viewed_at, last_viewed_at)
    values (v_trip, v_member, p_photo_id, v_at, v_at)
    on conflict (member_id, photo_id) where photo_id is not null do update
      set first_viewed_at = least(cv.first_viewed_at, excluded.first_viewed_at),
          last_viewed_at = greatest(cv.last_viewed_at, excluded.last_viewed_at);
  else
    insert into content_views as cv (trip_id, member_id, episode_id, first_viewed_at, last_viewed_at, heard_seconds)
    values (v_trip, v_member, p_episode_id, v_at, v_at, v_heard)
    on conflict (member_id, episode_id) where episode_id is not null do update
      set first_viewed_at = least(cv.first_viewed_at, excluded.first_viewed_at),
          last_viewed_at = greatest(cv.last_viewed_at, excluded.last_viewed_at),
          heard_seconds = greatest(cv.heard_seconds, excluded.heard_seconds);
  end if;
end;
$$;

revoke execute on function public.record_content_view(uuid, uuid, uuid, int, timestamptz) from public, anon;
grant execute on function public.record_content_view(uuid, uuid, uuid, int, timestamptz) to authenticated;
