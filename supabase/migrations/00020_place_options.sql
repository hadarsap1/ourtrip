-- "בנק אפשרויות" — one options bank per destination, unifying the two
-- overlapping planning lists that existed before:
--
--   saved_links            (manual bookmarks: Facebook posts, blog articles)
--   saved_recommendations  ("מה בסביבה" AI maybe-list, with geo fields)
--
-- Both were owner-only planning content, and both were empty when this ran, so
-- there is no data to migrate. They are dropped in 00021, AFTER the code that
-- reads them has shipped — dropping them here would break the live /links
-- screen the moment this migration is applied.
--
-- Lifecycle an option moves through:
--   option → shortlist → booked (carries booking_id) | rejected
--
-- Owner-only, like both tables it replaces: planning content is never visible
-- to kids or guests (CLAUDE.md rule #2).

create table place_options (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),

  -- Grouping. `country` is a free-text friendly label (as saved_links used) so
  -- the owners can group however they like; `country_code` is the ISO code when
  -- known (as saved_recommendations used), which lets an option line up with an
  -- itinerary day's country. Keeping both avoids forcing a lookup at entry time.
  country text,
  country_code text,
  area text,

  title text not null,
  -- hotel | attraction | restaurant | activity | transport | shop | other
  -- Free text rather than an enum: the family will invent categories mid-trip,
  -- and a CHECK constraint would turn that into a migration.
  category text,
  note text,

  -- Where this came from: manual | facebook | ai | link
  source text not null default 'manual',
  -- The originating Facebook post / blog article, kept so the option can always
  -- be traced back to its source.
  source_url text,
  -- Where to actually book it (hotel site, restaurant reservation page).
  booking_url text,

  -- Geo, populated when the option comes from the AI recommender or a Places
  -- pick. Lets an option render on the map alongside itinerary items.
  location_name text,
  lat double precision,
  lng double precision,
  place_id text,
  maps_url text,

  status text not null default 'option',
  -- Set when the option is promoted into a real booking. ON DELETE SET NULL:
  -- deleting a booking should not delete the planning history of considering it.
  booking_id uuid references bookings(id) on delete set null,

  created_by uuid references members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint place_options_status_check
    check (status in ('option', 'shortlist', 'booked', 'rejected'))
);

alter table place_options enable row level security;

create policy place_options_owner_all on place_options
  for all using (public.is_owner_of(trip_id))
  with check (public.is_owner_of(trip_id));

create trigger place_options_set_updated_at
  before update on place_options
  for each row execute function public.set_updated_at();

-- trip_id drives every list query; the composite covers the grouped view
-- (country → area) that the screen renders.
create index idx_place_options_trip_id on place_options(trip_id);
create index idx_place_options_trip_country on place_options(trip_id, country, area);
-- FK index, matching the convention established in 00012_fk_indexes.
create index idx_place_options_booking_id on place_options(booking_id);
