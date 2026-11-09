-- Photo albums by theme (DECISIONS #58).
--
-- Hadar 09/11/2026: "an album by theme - say 'vibe' photos of people on the
-- trip, somewhere to keep sharing such photos over time" - and then: "I do
-- not want every vibe photo to take the focus from the main updates. It
-- should not appear with all the photos, but guests should be able to see the
-- album and see a notification that a new photo went up there" (in the app,
-- no push).
--
-- So a photo uploaded into an album BELONGS to it (photos.album_id): it is
-- not in the place grid, the updates feed or the home - only in its album
-- and, for a kid's photo, in the approval queue. album_id is set at upload
-- and never changes. Deleting an album deletes its photos.
--
-- Rule 3 amendment (Hadar approved 09/11/2026): a parent's upload into an
-- album shared with guests is itself the explicit share step - the button
-- says "העלאה ושיתוף עם אורחים", and the client sends shared_with_guests.
-- A kid's upload is still forced pending and unshared (00001 trigger); a
-- parent approves and shares it in one explicit tap. Guests additionally see
-- an album photo only while its album is shared (photos_guest_select below):
-- unsharing the album hides all its photos at once.
--
-- "New" for the in-app notification: album_shared_at is when the photo
-- became visible to guests in the album (approved AND shared), so a kid's
-- photo approved a day later is still new to a guest who looked in between.
-- Each member's "last looked" is a feedback_seen row on the album id (00081).
--
-- RLS coverage:
--   albums  owners all (created_by is the caller); kids read every album;
--           guests read an album only when shared_with_guests.
--   photos  photos_guest_select gains "album_id is null or the album is
--           visible to me" - rule 3 (approved AND shared AND group) is kept
--           word for word. Inserting with an album of another trip is refused
--           by photos_album_guard for every role; no role can move a photo
--           between albums or out of one.
-- Probes: scripts/rls/probes/87_photo_albums.sql + the deny matrix.

create table if not exists public.albums (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  shared_with_guests boolean not null default false,
  created_by uuid not null references public.members(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_albums_trip_id on public.albums (trip_id, created_at);
create index if not exists idx_albums_created_by on public.albums (created_by);

alter table public.photos
  add column if not exists album_id uuid references public.albums(id) on delete cascade,
  add column if not exists album_shared_at timestamptz;

create index if not exists idx_photos_album_id on public.photos (album_id) where album_id is not null;

-- album -> trip without going through albums' own RLS
create or replace function public.album_trip_id(p_album_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select trip_id from albums where id = p_album_id;
$$;
revoke execute on function public.album_trip_id(uuid) from public, anon;
grant execute on function public.album_trip_id(uuid) to authenticated;

-- Runs after the kid rules (trigger names sort: photos_before_* first), so it
-- sees the final status and sharing.
create or replace function public.photos_album_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.album_id is distinct from old.album_id then
    raise exception 'a photo''s album cannot change' using errcode = '42501';
  end if;
  if new.album_id is not null then
    if tg_op = 'INSERT' and public.album_trip_id(new.album_id) is distinct from new.trip_id then
      raise exception 'album of another trip' using errcode = '42501';
    end if;
    if new.status = 'approved' and new.shared_with_guests then
      if tg_op = 'INSERT' or not (old.status = 'approved' and old.shared_with_guests) then
        new.album_shared_at := now();
      else
        new.album_shared_at := old.album_shared_at;
      end if;
    else
      new.album_shared_at := null;
    end if;
  else
    new.album_shared_at := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.photos_album_guard() from public, anon, authenticated;

drop trigger if exists photos_z_album_guard on public.photos;
create trigger photos_z_album_guard
  before insert or update on public.photos
  for each row execute function public.photos_album_guard();

alter table public.albums enable row level security;

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

-- rule 3 unchanged; an album photo also needs its album visible (shared)
alter policy photos_guest_select on photos
  using (
    trip_id = (select public.active_guest_trip())
    and status = 'approved'
    and shared_with_guests = true
    and (audience = '{}'::text[] or audience && (select public.my_guest_labels()))
    and (album_id is null or exists (select 1 from public.albums a where a.id = photos.album_id))
  );
