-- Photo albums by theme (DECISIONS #58).
--
-- Hadar 09/11/2026: "an album by theme - say 'vibe' photos of people on the
-- trip. Not about the place, just somewhere to keep sharing such photos over
-- time." The photos screen goes by place (#47); an album is a second way in.
--
-- An album is a label, not a folder: a photo stays in the place grid with its
-- likes and comments and may sit in any number of albums. Parents create,
-- rename, share and delete albums; parents and kids add photos to them (a kid
-- uploads into an album as always - pending until a parent approves, rule 4).
--
-- RLS coverage:
--   albums        owners all; kids read every album of the trip; guests read
--                 an album only when a parent set shared_with_guests.
--   album_photos  read: a row exists for you only when BOTH the album and the
--                 photo are visible to you under their own policies (as
--                 post_photos, 00043). For a guest that means the album is
--                 shared AND the photo is approved AND shared_with_guests AND
--                 in their group - an album never widens a photo (rule 3).
--                 Write: owners add/remove any; a kid adds a photo of the
--                 trip as themselves and removes only what they added.
--                 added_by is always the caller. No update policy. Guests
--                 write nothing.
-- Probes: scripts/rls/probes/87_photo_albums.sql + the deny matrix.

create table if not exists public.albums (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  -- the album itself: guests still see only the photos rule 3 lets through
  shared_with_guests boolean not null default false,
  created_by uuid not null references public.members(id),
  created_at timestamptz not null default now()
);

create table if not exists public.album_photos (
  album_id uuid not null references public.albums(id) on delete cascade,
  photo_id uuid not null references public.photos(id) on delete cascade,
  added_by uuid not null references public.members(id),
  created_at timestamptz not null default now(),
  primary key (album_id, photo_id)
);

create index if not exists idx_albums_trip_id on public.albums (trip_id, created_at);
create index if not exists idx_albums_created_by on public.albums (created_by);
create index if not exists idx_album_photos_photo_id on public.album_photos (photo_id);
create index if not exists idx_album_photos_added_by on public.album_photos (added_by);

-- album -> trip without going through albums' own RLS (the write paths, as
-- post_trip_id in 00043)
create or replace function public.album_trip_id(p_album_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select trip_id from albums where id = p_album_id;
$$;
revoke execute on function public.album_trip_id(uuid) from public, anon;
grant execute on function public.album_trip_id(uuid) to authenticated;

alter table public.albums enable row level security;
alter table public.album_photos enable row level security;

-- ============ RLS: albums ============

drop policy if exists albums_owner_all on public.albums;
create policy albums_owner_all on public.albums
  for all
  using (trip_id = (select public.member_trip_as('owner')))
  with check (
    trip_id = (select public.member_trip_as('owner'))
    and created_by = (select public.current_member_id())
  );

drop policy if exists albums_kid_select on public.albums;
create policy albums_kid_select on public.albums
  for select using (trip_id = (select public.member_trip_as('kid')));

drop policy if exists albums_guest_select on public.albums;
create policy albums_guest_select on public.albums
  for select using (
    trip_id = (select public.active_guest_trip())
    and shared_with_guests = true
  );

-- ============ RLS: album_photos ============

drop policy if exists album_photos_select on public.album_photos;
create policy album_photos_select on public.album_photos
  for select using (
    exists (select 1 from public.albums a where a.id = album_photos.album_id)
    and exists (select 1 from public.photos ph where ph.id = album_photos.photo_id)
  );

-- the photo must be of the album's trip; the photos subquery runs under the
-- caller's own RLS (owners and kids see every photo of their trip)
drop policy if exists album_photos_owner_insert on public.album_photos;
create policy album_photos_owner_insert on public.album_photos
  for insert with check (
    public.is_owner_of(public.album_trip_id(album_id))
    and added_by = public.current_member_id()
    and exists (select 1 from public.photos ph
                 where ph.id = album_photos.photo_id
                   and ph.trip_id = public.album_trip_id(album_photos.album_id))
  );

drop policy if exists album_photos_owner_delete on public.album_photos;
create policy album_photos_owner_delete on public.album_photos
  for delete using (public.is_owner_of(public.album_trip_id(album_id)));

drop policy if exists album_photos_kid_insert on public.album_photos;
create policy album_photos_kid_insert on public.album_photos
  for insert with check (
    public.is_kid_of(public.album_trip_id(album_id))
    and added_by = public.current_member_id()
    and exists (select 1 from public.photos ph
                 where ph.id = album_photos.photo_id
                   and ph.trip_id = public.album_trip_id(album_photos.album_id))
  );

drop policy if exists album_photos_kid_delete on public.album_photos;
create policy album_photos_kid_delete on public.album_photos
  for delete using (
    public.is_kid_of(public.album_trip_id(album_id))
    and added_by = public.current_member_id()
  );
