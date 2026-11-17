-- One request to open the app (QA 15/11/2026, "a faster home").
--
-- Opening the home asked the database one thing after another before
-- anything could be shown: link the login to its member, read the member row,
-- today's day, its items, whether a linked booking was cancelled, today's
-- bookings (two queries), and for a parent four "waiting for approval"
-- counts. Six round trips in a row, each paying the Asia-Europe trip to the
-- database's region - the query time itself is a few ms since 00086.
--
-- app_boot(p_today) answers all of it in one. The date is the phone's local
-- "today": the family's day, not the server's.
--
-- SECURITY INVOKER, on purpose: every read inside runs as the caller, under
-- the same policies as the separate queries it replaces. Nothing here is a
-- new way to see a row - a kid's and a guest's bookings and pending counts
-- are whatever their own policies return (nothing), exactly as before. The
-- one call that is not a plain read is link_member_to_auth_user() (00055),
-- which the app already made first on every open, with its own checks.
--
-- Signed in only. Returns {"role": null} for a login with no member row, and
-- the app then does what it always did (asks to join, or signs out).
-- Probe: scripts/rls/probes/96_app_boot.sql.

create or replace function public.app_boot(p_today date)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_role public.member_role;
  v_member jsonb;
  v_trip_id uuid;
  v_trip jsonb;
  v_day_id uuid;
  v_day jsonb;
begin
  v_role := public.link_member_to_auth_user();
  if v_role is null then
    return jsonb_build_object('role', null);
  end if;

  select to_jsonb(m) into v_member from members m where m.auth_user_id = auth.uid() limit 1;

  select t.id, to_jsonb(t) into v_trip_id, v_trip from trips t where t.is_active limit 1;
  if v_trip_id is null then
    return jsonb_build_object('role', v_role, 'member', v_member, 'trip', null);
  end if;

  select d.id, to_jsonb(d) into v_day_id, v_day
    from itinerary_days d where d.trip_id = v_trip_id and d.date = p_today limit 1;

  return jsonb_build_object(
    'role', v_role,
    'member', v_member,
    'trip', v_trip,
    'today', jsonb_build_object(
      'date', p_today,
      'day', v_day,
      -- an entry made from a booking that was later cancelled is not today's plan
      'items', coalesce((
        select jsonb_agg(to_jsonb(i) order by i.sort_order, i.start_time nulls last)
          from itinerary_items i
         where i.day_id = v_day_id
           and not exists (select 1 from bookings b where b.id = i.booking_id and b.status = 'cancelled')
      ), '[]'::jsonb),
      -- ranges covering today, then single-day bookings that start today
      'bookings', coalesce((
        select jsonb_agg(to_jsonb(b) order by (b.end_date is null), b.start_date)
          from bookings b
         where b.trip_id = v_trip_id and b.status <> 'cancelled'
           and ((b.start_date <= p_today and b.end_date >= p_today)
             or (b.start_date = p_today and b.end_date is null))
      ), '[]'::jsonb)
    ),
    'pending', jsonb_build_object(
      'stories', (select count(*) from posts where trip_id = v_trip_id and status = 'pending'),
      'photos', (select count(*) from photos where trip_id = v_trip_id and status = 'pending'),
      'episodes', (select count(*) from episodes where trip_id = v_trip_id and status = 'pending'),
      'guestRequests', (select count(*) from guest_join_requests where trip_id = v_trip_id and status = 'pending')
    )
  );
end;
$$;

revoke execute on function public.app_boot(date) from public, anon;
grant execute on function public.app_boot(date) to authenticated;
