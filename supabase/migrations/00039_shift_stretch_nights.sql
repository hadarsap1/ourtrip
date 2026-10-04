-- Approved 04/10/2026. NOT YET APPLIED: two apply attempts through the Supabase connector timed out (nothing was created). Apply this file as is, then turn on the nightsStepper flag.
--
-- F4 nights stepper. Adds or removes ONE night at the end of a stretch and
-- moves every later day with it (decision 04/10/2026: "move forward").
--
--   select public.shift_stretch_nights(p_trip_id, p_last_date, +1)
--     new day on p_last_date + 1 copying the stretch's place; every day after
--     p_last_date moves +1; trips.end_date +1.
--   select public.shift_stretch_nights(p_trip_id, p_last_date, -1)
--     deletes the day on p_last_date (only if nothing hangs off it: items,
--     routes, journal); every later day moves -1; trips.end_date -1.
--
-- Bookings are NOT moved - they are real reservations with real dates. The
-- result reports how many bookings start after p_last_date so the UI can tell
-- the family to check them.
--
-- SECURITY INVOKER: runs under the caller's RLS, so only owners can change
-- days (itinerary_days_owner_all, trips_owner_all). The explicit is_owner_of
-- check gives a clear error instead of a silent zero-row update.
--
-- The unique (trip_id, date) constraint is not deferrable, so the shift is done
-- in two phases (park far in the future, then land) inside this one function -
-- one transaction, all or nothing.
--
-- Rollback: docs/upgrade/migrations/00039_shift_stretch_nights.down.sql (drops the function only).

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

revoke execute on function public.shift_stretch_nights(uuid, date, int) from public, anon;
grant execute on function public.shift_stretch_nights(uuid, date, int) to authenticated;

comment on function public.shift_stretch_nights(uuid, date, int) is
  'F4 nights stepper: +/-1 night at the end of a stretch, later days follow. Owners only (RLS + is_owner_of). Bookings untouched.';
