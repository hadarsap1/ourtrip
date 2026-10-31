-- Rollback for 00078. Run ONLY if the merged journal must be undone, and
-- before anyone writes a journal entry in the new app (it brings back the
-- old journal table as it was; entries written after 00078 live only in posts
-- and are NOT copied back). Then redeploy the previous app version.

alter table journal_entries_archive_00078 rename to journal_entries;

-- the policies 00078 dropped (00001 owner + 00007 kid; guests none since 00048)
create policy journal_entries_owner_all on journal_entries
  for all using (public.is_owner_of(trip_id)) with check (public.is_owner_of(trip_id));
create policy journal_entries_kid_own_all on journal_entries
  for all using (author_id = public.current_member_id() and public.is_kid_of(trip_id))
  with check (author_id = public.current_member_id() and public.is_kid_of(trip_id));
alter publication supabase_realtime add table journal_entries;

alter table photos add column journal_entry_id uuid references journal_entries(id);
create index if not exists idx_photos_journal_entry_id on photos(journal_entry_id);
alter table posts add column journal_entry_id uuid references journal_entries(id) on delete set null;
create index if not exists idx_posts_journal_entry_id on posts(journal_entry_id);

-- posts that were copied from the journal (same id) go back to being only there
update photos ph set journal_entry_id = pp.post_id
  from post_photos pp
 where pp.photo_id = ph.id
   and exists (select 1 from journal_entries j where j.id = pp.post_id);
delete from posts p where exists (select 1 from journal_entries j where j.id = p.id);

-- 00078's own objects
drop index if exists idx_posts_trip_entry_date;
alter table posts drop column if exists mood, drop column if exists entry_date;
alter table posts drop constraint if exists posts_public_has_title;
update posts set title = left(coalesce(nullif(trim(split_part(body, E'\n', 1)), ''), '…'), 120) where title is null;
alter table posts alter column title set not null;

alter policy posts_kid_select on posts
  using (
    trip_id = (select public.member_trip_as('kid'))
    and (status = 'approved' or author_id = (select public.current_member_id()))
  );
alter policy posts_kid_delete on posts
  using (public.is_kid_of(trip_id) and author_id = public.current_member_id() and status <> 'approved');
drop function if exists public.member_role_of(uuid);

create or replace function public.is_own_open_post(p_post_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from posts where id = p_post_id
                  and author_id = public.current_member_id() and status <> 'approved');
$$;

-- posts_guard as in 00076
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
      -- a kid can move a story between draft and pending, nothing else;
      -- editing an approved story sends it back to a parent (00076), with
      -- the audience the parent published it to (probe 63: a kid cannot
      -- widen a published story)
      if old.status = 'approved' then
        new.status := 'pending';
        new.audience := old.audience;
      elsif new.status = 'approved' then
        new.status := old.status;
      end if;
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

-- shift_stretch_nights as in 00039
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
       or exists (select 1 from journal_entries where trip_id = p_trip_id and entry_date = p_last_date) then
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
