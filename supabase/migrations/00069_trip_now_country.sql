-- "What time is it for them now?" (Hadar 23/10/2026). Guests in Israel see
-- the family's local time and the country they are in today; kids see the
-- time in Israel (that half needs nothing from the database).
--
-- Guests cannot read today's itinerary day: itinerary_days_guest_select only
-- returns days with a done, shared item (00009), so the plan never leaks.
-- trip_now_country() hands out exactly one fact - the country code of the day
-- the family is living now - to anyone on the trip, and nothing about the
-- day itself (no place, no items, no dates ahead).
--
-- "Now" is the family's date, not Israel's: the route is east of Israel, so
-- tomorrow (Israel date) is already today for them for part of the day. The
-- candidate whose date is the current date in its own country's zone wins.
-- The zone per country mirrors ZONE_BY_COUNTRY in
-- supabase/functions/_shared/notifyPolicy.ts; an unknown country falls back
-- to Israel's date, which is at worst a few hours off on a border day.

create function public.country_time_zone(p_country text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case upper(coalesce(p_country, ''))
    when 'VN' then 'Asia/Ho_Chi_Minh'
    when 'KH' then 'Asia/Phnom_Penh'
    when 'LA' then 'Asia/Vientiane'
    when 'TH' then 'Asia/Bangkok'
    when 'PH' then 'Asia/Manila'
    when 'JP' then 'Asia/Tokyo'
    when 'GE' then 'Asia/Tbilisi'
    when 'MY' then 'Asia/Kuala_Lumpur'
    when 'SG' then 'Asia/Singapore'
    when 'ID' then 'Asia/Jakarta'
    when 'KR' then 'Asia/Seoul'
    when 'TW' then 'Asia/Taipei'
    when 'NP' then 'Asia/Kathmandu'
    when 'IN' then 'Asia/Kolkata'
    when 'LK' then 'Asia/Colombo'
    when 'AE' then 'Asia/Dubai'
    when 'TR' then 'Europe/Istanbul'
    else 'Asia/Jerusalem'
  end
$$;

create function public.trip_now_country(p_trip_id uuid)
returns text
language sql stable security definer set search_path = public as $$
  select d.country_code
    from itinerary_days d
   where d.trip_id = p_trip_id
     and d.country_code is not null
     and (public.is_owner_of(p_trip_id) or public.is_kid_of(p_trip_id) or public.is_active_guest_of(p_trip_id))
     and d.date between (now() at time zone 'Asia/Jerusalem')::date
                    and (now() at time zone 'Asia/Jerusalem')::date + 1
     and d.date = (now() at time zone public.country_time_zone(d.country_code))::date
   order by d.date desc
   limit 1;
$$;

revoke execute on function public.trip_now_country(uuid) from public, anon;
grant execute on function public.trip_now_country(uuid) to authenticated;
