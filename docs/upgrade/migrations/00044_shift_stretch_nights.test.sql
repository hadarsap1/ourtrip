-- Local test for 00044 (stub schema). Run: psql -d <scratch db> -f this file from the repo root.
-- Expected: 'owners only', then shifts, 'day_not_empty', 'delta must be 1 or -1', 'no day on 2027-01-01'.
\set ON_ERROR_STOP 0
create table trips (id uuid primary key, end_date date);
create table itinerary_days (id uuid primary key default gen_random_uuid(), trip_id uuid not null references trips(id), date date not null, location_name text, country_code text, lat float8, lng float8, notes text, updated_at timestamptz not null default now(), unique (trip_id, date));
create table itinerary_items (id uuid primary key default gen_random_uuid(), day_id uuid not null references itinerary_days(id));
create table routes (id uuid primary key default gen_random_uuid(), trip_id uuid, day_id uuid references itinerary_days(id));
create table journal_entries (id uuid primary key default gen_random_uuid(), trip_id uuid, entry_date date);
create table bookings (id uuid primary key default gen_random_uuid(), trip_id uuid, start_date date, status text default 'confirmed');
create function public.is_owner_of(p uuid) returns boolean language sql as $$ select current_setting('test.owner', true) = 'yes' $$;
insert into trips values ('00000000-0000-0000-0000-000000000001', '2026-11-10');
insert into itinerary_days (trip_id, date, location_name, country_code) select '00000000-0000-0000-0000-000000000001', d::date, case when d < '2026-11-05' then 'האנוי' else 'בנגקוק' end, case when d < '2026-11-05' then 'VN' else 'TH' end from generate_series('2026-11-01'::date, '2026-11-10', '1 day') d;
insert into itinerary_items (day_id) select id from itinerary_days where date = '2026-11-07';
insert into bookings (trip_id, start_date) values ('00000000-0000-0000-0000-000000000001','2026-11-06'),('00000000-0000-0000-0000-000000000001','2026-11-02');
\i docs/upgrade/migrations/00044_shift_stretch_nights.sql
\echo '--- not owner'
select shift_stretch_nights('00000000-0000-0000-0000-000000000001', '2026-11-04', 1);
set test.owner = 'yes';
\echo '--- add night to VN (ends 04/11)'
select shift_stretch_nights('00000000-0000-0000-0000-000000000001', '2026-11-04', 1);
select string_agg(to_char(date,'DD') || country_code, ' ' order by date) from itinerary_days;
select date as item_day from itinerary_days d join itinerary_items i on i.day_id = d.id;
select end_date from trips;
\echo '--- remove that night again'
select shift_stretch_nights('00000000-0000-0000-0000-000000000001', '2026-11-05', -1);
select string_agg(to_char(date,'DD') || country_code, ' ' order by date) from itinerary_days;
select date as item_day from itinerary_days d join itinerary_items i on i.day_id = d.id;
select end_date from trips;
\echo '--- remove a day that has an item (07/11) -> refuse, nothing changes'
select shift_stretch_nights('00000000-0000-0000-0000-000000000001', '2026-11-07', -1);
select count(*) days, max(date) from itinerary_days;
\echo '--- bad delta / missing day'
select shift_stretch_nights('00000000-0000-0000-0000-000000000001', '2026-11-04', 2);
select shift_stretch_nights('00000000-0000-0000-0000-000000000001', '2027-01-01', 1);
\echo '--- add at the last day of the trip'
select shift_stretch_nights('00000000-0000-0000-0000-000000000001', '2026-11-10', 1);
select max(date), (select end_date from trips) from itinerary_days;
