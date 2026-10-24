-- Sharing, phases 0 + 1 (docs/DESIGN-sharing.md): guest labels and stories.
--
-- PHASE 0. `guests_allowlist.label` groups an invited guest as family, a
-- class, or friends. It is for managing and addressing the list only: every
-- active guest still sees exactly the same content (decided 13/10, question
-- 2). No policy reads it.
--
-- PHASE 1. A story (`posts`) is a blog post: a title, a body, photos, a day
-- and a place. It has one audience, chosen by a parent:
--
--   family  - owners + kids
--   guests  - owners + kids + active guests
--   public  - everyone with the link (anon policy lands in 00046)
--
-- and one status:
--
--   draft    - the author is still writing. Author + owners only.
--   pending  - a kid sent it for approval. Author + owners only.
--   approved - published to its audience.
--
-- The same two-step shape as photos (DECISIONS #4/#5): a kid writes, a parent
-- approves and chooses who sees it. A kid can never approve, never choose the
-- audience and never touch an approved story; `posts_guard` enforces that in
-- the database whatever the client sends, the way photos_guard_update does.
--
-- A story never widens what a photo shows. A guest reading a guests-story sees
-- only the photos in it that are themselves approved AND shared_with_guests
-- (post_photos_select defers to the caller's RLS on `photos`), so publishing a
-- story is not a back door around DECISIONS #5. The UI offers to share the
-- story's photos in the same tap, as an explicit owner action.
--
-- Kid-written stories can never be public, for any role: enforced here too.

-- ============ PHASE 0: guest labels ============

alter table guests_allowlist
  add column label text check (label is null or char_length(label) between 1 and 40);

comment on column guests_allowlist.label is
  'Free-text group for managing the guest list (family / a class / friends). '
  'Addressing only: no policy reads it, every active guest sees the same content.';

-- ============ PHASE 1: stories ============

create type post_visibility as enum ('family', 'guests', 'public');
create type post_status as enum ('draft', 'pending', 'approved');

create table posts (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  author_id uuid not null references members(id),
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 20000),
  day_id uuid references itinerary_days(id) on delete set null,
  -- city / country only (DESIGN-sharing §1: no hotel, no live location)
  place_label text check (place_label is null or char_length(place_label) <= 80),
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  journal_entry_id uuid references journal_entries(id) on delete set null,
  status post_status not null default 'draft',
  visibility post_visibility not null default 'family',
  -- "publish after we left": hidden from guests and the public until then
  publish_after timestamptz,
  -- set by posts_guard the first time a story goes public; never reused
  public_slug text unique,
  approved_by uuid references members(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table posts is
  'Stories (the blog). Audience = visibility, gate = status; see migration 00043.';

create index idx_posts_trip_feed on posts(trip_id, status, published_at desc);
create index idx_posts_author_id on posts(author_id);
create index idx_posts_day_id on posts(day_id);
create index idx_posts_journal_entry_id on posts(journal_entry_id);
create index idx_posts_approved_by on posts(approved_by);

create trigger posts_set_updated_at
  before update on posts
  for each row execute function public.set_updated_at();

create table post_photos (
  post_id uuid not null references posts(id) on delete cascade,
  photo_id uuid not null references photos(id) on delete cascade,
  position int not null default 0,
  -- object path in the public bucket while the story is public (00046)
  public_path text,
  primary key (post_id, photo_id)
);

create index idx_post_photos_photo_id on post_photos(photo_id);

-- ============ GUARD ============
-- Runs as definer so the author's role is read past members RLS.

create or replace function public.posts_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  author_role member_role;
  caller_role member_role := public.current_member_role();
begin
  select role into author_role from members where id = new.author_id;

  if caller_role = 'kid' then
    if tg_op = 'INSERT' then
      -- a kid may only start a draft or send one straight for approval
      if new.status = 'approved' then new.status := 'pending'; end if;
      new.visibility := 'family';
      new.publish_after := null;
    else
      -- a kid can move a story between draft and pending, nothing else
      if new.status = 'approved' then new.status := old.status; end if;
      new.visibility := old.visibility;
      new.publish_after := old.publish_after;
      new.author_id := old.author_id;
      new.trip_id := old.trip_id;
    end if;
    new.approved_by := case when tg_op = 'INSERT' then null else old.approved_by end;
    new.published_at := case when tg_op = 'INSERT' then null else old.published_at end;
    new.public_slug := case when tg_op = 'INSERT' then null else old.public_slug end;
  end if;

  -- DESIGN-sharing §1: a story a kid wrote is never public, whoever asks
  if new.visibility = 'public' and author_role is distinct from 'owner' then
    raise exception 'only a parent''s own story can be public'
      using errcode = '42501';
  end if;

  if new.status = 'approved' then
    new.published_at := coalesce(new.published_at, now());
    if new.approved_by is null and caller_role = 'owner' then
      new.approved_by := public.current_member_id();
    end if;
  else
    new.published_at := null;
  end if;

  if new.visibility = 'public' and new.public_slug is null then
    new.public_slug := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  end if;

  return new;
end;
$$;

revoke execute on function public.posts_guard() from public, anon, authenticated;

create trigger posts_guard
  before insert or update on posts
  for each row execute function public.posts_guard();

-- Security-definer lookups so post_photos policies need not query `posts`
-- through its own RLS for the write paths (same pattern as 00009).
create or replace function public.post_trip_id(p_post_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select trip_id from posts where id = p_post_id;
$$;

create or replace function public.is_own_open_post(p_post_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from posts
    where id = p_post_id
      and author_id = public.current_member_id()
      and status <> 'approved'
  );
$$;

-- ============ RLS: posts ============

alter table posts enable row level security;
alter table post_photos enable row level security;

create policy posts_owner_all on posts
  for all using (public.is_owner_of(trip_id))
  with check (public.is_owner_of(trip_id));

-- kids: every published story (all audiences include the family) + their own
create policy posts_kid_select on posts
  for select using (
    public.is_kid_of(trip_id)
    and (status = 'approved' or author_id = public.current_member_id())
  );

create policy posts_kid_insert on posts
  for insert with check (
    public.is_kid_of(trip_id) and author_id = public.current_member_id()
  );

-- only while not yet approved; posts_guard freezes audience and approval
create policy posts_kid_update on posts
  for update using (
    public.is_kid_of(trip_id)
    and author_id = public.current_member_id()
    and status <> 'approved'
  ) with check (
    public.is_kid_of(trip_id) and author_id = public.current_member_id()
  );

create policy posts_kid_delete on posts
  for delete using (
    public.is_kid_of(trip_id)
    and author_id = public.current_member_id()
    and status <> 'approved'
  );

-- guests: published, addressed to guests (or everyone), and past publish_after
create policy posts_guest_select on posts
  for select using (
    public.is_active_guest_of(trip_id)
    and status = 'approved'
    and visibility in ('guests', 'public')
    and (publish_after is null or publish_after <= now())
  );

-- ============ RLS: post_photos ============
-- Read: a row exists for you only when BOTH the story and the photo are
-- visible to you under their own policies. For a guest that means the photo
-- is approved AND shared_with_guests - publishing a story never widens it.

create policy post_photos_select on post_photos
  for select using (
    exists (select 1 from posts p where p.id = post_photos.post_id)
    and exists (select 1 from photos ph where ph.id = post_photos.photo_id)
  );

create policy post_photos_owner_write on post_photos
  for all using (public.is_owner_of(public.post_trip_id(post_id)))
  with check (public.is_owner_of(public.post_trip_id(post_id)));

-- kids attach / detach photos on their own unapproved stories only, and never
-- a public copy path
create policy post_photos_kid_insert on post_photos
  for insert with check (
    public.is_kid_of(public.post_trip_id(post_id))
    and public.is_own_open_post(post_id)
    and public_path is null
  );

create policy post_photos_kid_delete on post_photos
  for delete using (
    public.is_kid_of(public.post_trip_id(post_id))
    and public.is_own_open_post(post_id)
  );
