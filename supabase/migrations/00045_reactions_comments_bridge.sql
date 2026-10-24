-- Sharing, phase 3 (docs/DESIGN-sharing.md §4, docs/DESIGN-wall-bridge.md):
-- likes, comments, and the parent-operated bridge between the two feeds.
--
-- REACTIONS. A fixed set of kinds on a story or an episode. Owners, kids and
-- active guests can add their own and see everyone's, on items they can see.
-- Kids see who liked what ("סבתא ❤") - a like is not a channel anyone can
-- write words into, so showing it keeps DECISIONS #18 true.
--
-- COMMENTS. Words, from guests (and parents). Owners + active guests read
-- them. Kids have NO policy on `comments` at all: a feed a child can read is
-- a feed a child can be addressed in (DECISIONS #18). A comment reaches the
-- kids only when a parent bridges it, below.
--
-- THE BRIDGE (DESIGN-wall-bridge, approved 13/10). Nothing crosses between
-- the family feed and the guests feed on its own. A parent copies ONE item
-- across, deliberately:
--
--   kid message      -> guests feed   (parent taps "share with guests")
--   guest message    -> family feed   (parent taps "show the kids")
--   guest comment    -> family feed   (parent taps "show the kids")
--
-- The copy is a new `messages` row in a feed its readers were already
-- entitled to, so the 00027 channel policies stay exactly as they are. Only
-- an owner can create one: owners already insert into both channels with any
-- sender (messages_owner_all), and messages_bridge_guard strips the bridge
-- columns from anyone else's insert so a guest cannot fake an attribution.

-- ============ REACTIONS ============

create type reaction_kind as enum ('heart', 'smile', 'wow', 'star');

create table reactions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  member_id uuid not null references members(id) on delete cascade,
  post_id uuid references posts(id) on delete cascade,
  episode_id uuid references episodes(id) on delete cascade,
  kind reaction_kind not null,
  created_at timestamptz not null default now(),
  check ((post_id is null) <> (episode_id is null))
);

create unique index reactions_once_per_post
  on reactions(member_id, post_id, kind) where post_id is not null;
create unique index reactions_once_per_episode
  on reactions(member_id, episode_id, kind) where episode_id is not null;
create index idx_reactions_post_id on reactions(post_id);
create index idx_reactions_episode_id on reactions(episode_id);
create index idx_reactions_trip_id on reactions(trip_id);

-- ============ COMMENTS ============

create table comments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  author_id uuid not null references members(id) on delete cascade,
  post_id uuid references posts(id) on delete cascade,
  episode_id uuid references episodes(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  -- stamped when a parent bridges this comment to the kids
  shown_to_kids_at timestamptz,
  shown_by uuid references members(id),
  created_at timestamptz not null default now(),
  check ((post_id is null) <> (episode_id is null))
);

create index idx_comments_post_id on comments(post_id, created_at);
create index idx_comments_episode_id on comments(episode_id, created_at);
create index idx_comments_trip_id on comments(trip_id);
create index idx_comments_author_id on comments(author_id);
create index idx_comments_shown_by on comments(shown_by);

-- The target must be visible to the CALLER and belong to the row's trip.
-- Deliberately not security definer: the subqueries run under the caller's
-- own RLS on posts / episodes, so "you can react to what you can see".
create or replace function public.feedback_target_visible(
  p_trip_id uuid, p_post_id uuid, p_episode_id uuid
)
returns boolean
language sql stable security invoker set search_path = public
as $$
  select case
    when p_post_id is not null then
      exists (select 1 from posts p where p.id = p_post_id and p.trip_id = p_trip_id)
    else
      exists (select 1 from episodes e where e.id = p_episode_id and e.trip_id = p_trip_id)
  end;
$$;

alter table reactions enable row level security;
alter table comments enable row level security;

create policy reactions_owner_all on reactions
  for all using (public.is_owner_of(trip_id))
  with check (
    public.is_owner_of(trip_id)
    and member_id = public.current_member_id()
    and public.feedback_target_visible(trip_id, post_id, episode_id)
  );

create policy reactions_member_select on reactions
  for select using (
    (public.is_kid_of(trip_id) or public.is_active_guest_of(trip_id))
    and public.feedback_target_visible(trip_id, post_id, episode_id)
  );

create policy reactions_member_insert on reactions
  for insert with check (
    (public.is_kid_of(trip_id) or public.is_active_guest_of(trip_id))
    and member_id = public.current_member_id()
    and public.feedback_target_visible(trip_id, post_id, episode_id)
  );

create policy reactions_self_delete on reactions
  for delete using (member_id = public.current_member_id());

create policy comments_owner_all on comments
  for all using (public.is_owner_of(trip_id))
  with check (public.is_owner_of(trip_id));

create policy comments_guest_select on comments
  for select using (
    public.is_active_guest_of(trip_id)
    and public.feedback_target_visible(trip_id, post_id, episode_id)
  );

create policy comments_guest_insert on comments
  for insert with check (
    public.is_active_guest_of(trip_id)
    and author_id = public.current_member_id()
    and shown_to_kids_at is null
    and shown_by is null
    and public.feedback_target_visible(trip_id, post_id, episode_id)
  );

create policy comments_guest_delete on comments
  for delete using (
    public.is_active_guest_of(trip_id) and author_id = public.current_member_id()
  );

-- (no kid policy on comments, on purpose - see the header)

-- ============ THE BRIDGE ============

alter table messages
  -- on the COPY: what it was bridged from, which parent did it, and a short
  -- line of context ("on the story: ...") since kids cannot read comments
  add column origin_message_id uuid references messages(id) on delete set null,
  add column origin_comment_id uuid references comments(id) on delete set null,
  add column bridged_by uuid references members(id),
  add column bridged_context text check (bridged_context is null or char_length(bridged_context) <= 200),
  -- on the ORIGINAL: stamped when a parent bridges it, so its author sees it
  -- went out without being able to read the other feed
  add column bridged_at timestamptz;

-- one copy per original, not one per tap
create unique index idx_messages_origin_message_once
  on messages(origin_message_id) where origin_message_id is not null;
create unique index idx_messages_origin_comment_once
  on messages(origin_comment_id) where origin_comment_id is not null;
create index idx_messages_bridged_by on messages(bridged_by);

create or replace function public.messages_bridge_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.current_member_role() is distinct from 'owner' then
    new.origin_message_id := null;
    new.origin_comment_id := null;
    new.bridged_by := null;
    new.bridged_context := null;
    new.bridged_at := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.messages_bridge_guard() from public, anon, authenticated;

create trigger messages_bridge_guard
  before insert on messages
  for each row execute function public.messages_bridge_guard();

-- likes and comments land live on every device that may see them
alter publication supabase_realtime add table public.reactions;
alter publication supabase_realtime add table public.comments;
