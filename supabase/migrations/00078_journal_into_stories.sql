-- One journal: the journal and the stories become one feed (Hadar 31/10/2026).
--
-- "סיפורים / יומן / קיר / איפה היינו" read as four places for the same day.
-- The wall stays apart (it is the conversation with the guests); the journal
-- and the stories merge into `posts`, the "יומן המסע". Every entry has one
-- audience, as stories always had (00043):
--
--   family  "רק המשפחה"     - owners + kids, no gate (what the journal was)
--   guests  "גם לחברים"     - a parent publishes; a kid's entry waits for one
--   public  the open blog   - a parent's own entry only (00046, unchanged)
--
-- What changes:
--
--   * posts gains the journal's fields: `mood`, `entry_date`; `title` becomes
--     optional (a journal line has none), but a public entry still needs one -
--     it is the open page's headline and link preview.
--   * A kid's family entry needs no parent, the way a journal entry never
--     did: posts_guard lets a kid hold 'approved' while the entry is
--     'family'. Anything wider still goes through a parent - visibility stays
--     frozen for kids, and editing an approved guests entry sends it back
--     (00076). Nothing about what guests see moves.
--   * A kid's family entry stays private to that kid and the parents, as a
--     journal entry was (journal_entries_kid_own_all, 00007): a kid reads
--     another kid's entry only once it went out to the guests.
--   * A kid may add photos to their own family entry after saving it; photos
--     keep their own gate (DECISIONS #5) whatever entry they are in.
--   * Every journal entry is copied into posts with its id, its photos move
--     to post_photos, and an entry that already became a story is folded into
--     that story instead of becoming a second copy. journal_entries is kept,
--     renamed and with no policy left, as a safety copy readable only with
--     the service role; nothing reads it.
--   * shift_stretch_nights (00039) checks entries on the day in posts.

-- ============ posts: the journal's fields ============

alter table posts alter column title drop not null;
alter table posts drop constraint if exists posts_title_check;
alter table posts
  add constraint posts_title_check check (title is null or char_length(title) between 1 and 120),
  add constraint posts_public_has_title check (visibility <> 'public' or title is not null),
  add column mood text check (mood is null or char_length(mood) <= 16),
  add column entry_date date;

-- a story's day: its itinerary day, else when it went out, else when written
update posts p
   set entry_date = coalesce(
     (select d.date from itinerary_days d where d.id = p.day_id),
     p.published_at::date,
     p.created_at::date
   );

alter table posts
  alter column entry_date set default current_date,
  alter column entry_date set not null;

create index idx_posts_trip_entry_date on posts(trip_id, entry_date desc);

comment on column posts.entry_date is
  'The day the entry is about (the journal''s entry_date, 00078).';
comment on table posts is
  'The trip journal ("יומן המסע"): journal entries and stories in one feed. '
  'Audience = visibility, gate = status; see 00043 and 00078.';

-- ============ copy the journal in ============

-- an entry that already became a story: the story is the merged entry
update posts p
   set mood = j.mood,
       entry_date = j.entry_date
  from journal_entries j
 where p.journal_entry_id = j.id;

-- every other entry becomes a family post with the same id. Inserted as the
-- migration (no member): posts_guard leaves the row as given.
insert into posts (id, trip_id, author_id, title, body, mood, entry_date, place_label,
                   status, visibility, published_at, created_at, updated_at)
select j.id, j.trip_id, j.author_id, null, left(j.body, 20000), j.mood, j.entry_date,
       nullif(left(j.location_name, 80), ''),
       'approved', 'family', j.created_at, j.created_at, j.updated_at
  from journal_entries j
 where not exists (select 1 from posts p where p.journal_entry_id = j.id)
   and not exists (select 1 from posts p where p.id = j.id);

-- their photos, in the order they were taken; photos of an entry that became
-- a story were copied by storyFromJournal and are already there
insert into post_photos (post_id, photo_id, position)
select ph.journal_entry_id, ph.id,
       (row_number() over (partition by ph.journal_entry_id order by ph.created_at)) - 1
  from photos ph
 where ph.journal_entry_id is not null
   and exists (select 1 from posts p where p.id = ph.journal_entry_id)
on conflict do nothing;

alter table photos drop column journal_entry_id;
alter table posts drop column journal_entry_id;

-- the safety copy: no client policy, out of realtime
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where tablename = 'journal_entries' loop
    execute format('drop policy %I on journal_entries', pol.policyname);
  end loop;
  if exists (select 1 from pg_publication_tables
              where pubname = 'supabase_realtime' and tablename = 'journal_entries') then
    execute 'alter publication supabase_realtime drop table journal_entries';
  end if;
end $$;
alter table journal_entries rename to journal_entries_archive_00078;
comment on table journal_entries_archive_00078 is
  'Copy of the journal before it merged into posts (00078). No client access; safe to drop.';

-- ============ who reads what ============

-- Security definer: the author's role, past members RLS. Answers only for a
-- member of the caller's own trip, and only with a role. Policies without a
-- role list are evaluated for anon too, so anon may call it (and gets null).
create or replace function public.member_role_of(p_member_id uuid)
returns member_role
language sql stable security definer set search_path = public
as $$
  select m.role from members m
   where m.id = p_member_id
     and m.trip_id = (select c.trip_id from members c where c.id = public.current_member_id());
$$;
revoke execute on function public.member_role_of(uuid) from public;
grant execute on function public.member_role_of(uuid) to anon, authenticated;

-- kids: their own entries, a parent's published ones, and another kid's only
-- once it went out wider than the family (a kid's family entry is their diary)
alter policy posts_kid_select on posts
  using (
    trip_id = (select public.member_trip_as('kid'))
    and (
      author_id = (select public.current_member_id())
      or (status = 'approved'
          and (visibility <> 'family' or public.member_role_of(author_id) = 'owner'))
    )
  );

-- a kid adds or removes photos on their own entry while it is open, or any
-- time it is family-only (it has no gate to pass)
create or replace function public.is_own_open_post(p_post_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from posts
    where id = p_post_id
      and author_id = public.current_member_id()
      and (status <> 'approved' or visibility = 'family')
  );
$$;

-- a kid may delete their own entry while it is open or family-only
alter policy posts_kid_delete on posts
  using (
    public.is_kid_of(trip_id)
    and author_id = public.current_member_id()
    and (status <> 'approved' or visibility = 'family')
  );

-- ============ the guard ============

-- posts_guard (00076) plus: a kid's family entry needs no parent.
create or replace function public.posts_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  author_role member_role;
  caller_role member_role := public.current_member_role();
begin
  select role into author_role from members where id = new.author_id;

  if caller_role = 'kid' then
    if tg_op = 'INSERT' then
      -- a kid writes for the family (saved as is) or asks to share (pending);
      -- the audience is always the family until a parent widens it, so a
      -- kid asking for a wider one is asking a parent
      if new.visibility <> 'family' and new.status = 'approved' then
        new.status := 'pending';
      end if;
      new.visibility := 'family';
      new.publish_after := null;
    else
      -- an entry that went out to guests goes back to a parent when a kid
      -- edits it (00076), with the audience the parent published it to
      -- (probe 63: a kid cannot widen a published story)
      if old.status = 'approved' and old.visibility <> 'family' then
        new.status := 'pending';
        new.audience := old.audience;
      end if;
      new.visibility := old.visibility;
      new.publish_after := old.publish_after;
      new.author_id := old.author_id;
      new.trip_id := old.trip_id;
    end if;
    -- only a family entry is the kid's to publish
    if new.status = 'approved' and new.visibility <> 'family' then
      new.status := 'pending';
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

-- ============ the nights stepper (00039) ============

create or replace function public.shift_stretch_nights(p_trip_id uuid, p_last_date date, p_delta int)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_src itinerary_days%rowtype;
  v_moved int;
  v_bookings int;
  v_park constant int := 36500; -- 100 years; no real trip day lives there
begin
  if p_delta not in (1, -1) then
    raise exception 'delta must be 1 or -1' using errcode = '22023';
  end if;
  if not coalesce(public.is_owner_of(p_trip_id), false) then
    raise exception 'owners only' using errcode = '42501';
  end if;

  select * into v_src from itinerary_days where trip_id = p_trip_id and date = p_last_date;
  if not found then
    raise exception 'no day on %', p_last_date using errcode = 'P0002';
  end if;

  if p_delta = -1 then
    if exists (select 1 from itinerary_items where day_id = v_src.id)
       or exists (select 1 from routes where day_id = v_src.id)
       or exists (select 1 from posts where trip_id = p_trip_id and entry_date = p_last_date) then
      raise exception 'day_not_empty' using errcode = 'P0001';
    end if;
    delete from itinerary_days where id = v_src.id;
  end if;

  -- phase 1: park every later day out of the way
  update itinerary_days set date = date + v_park
    where trip_id = p_trip_id and date > p_last_date;
  get diagnostics v_moved = row_count;
  -- phase 2: land them shifted by delta
  update itinerary_days set date = date - v_park + p_delta, updated_at = now()
    where trip_id = p_trip_id and date > p_last_date + v_park;

  if p_delta = 1 then
    insert into itinerary_days (trip_id, date, location_name, country_code, lat, lng)
      values (p_trip_id, p_last_date + 1, v_src.location_name, v_src.country_code, v_src.lat, v_src.lng);
  end if;

  update trips set end_date = end_date + p_delta
    where id = p_trip_id and end_date is not null and end_date >= p_last_date;

  select count(*) into v_bookings from bookings
    where trip_id = p_trip_id and start_date > p_last_date and status <> 'cancelled';

  return jsonb_build_object('moved', v_moved, 'bookings_after', v_bookings);
end;
$$;
