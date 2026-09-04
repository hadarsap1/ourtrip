-- Give an option somewhere to go that is not a booking.
--
-- WHAT WAS TRUE. `place_options` shipped with the lifecycle
-- option → shortlist → booked | rejected, and the only code path out of
-- `option` was promoteToBooking(), which creates a real booking. That is the
-- right flow for a hotel and the wrong flow for an attraction, a restaurant, a
-- viewpoint or a walk — which is most of the bank. Measured on 2026-09-04: 343
-- options, ALL of them status 'option'. Not one row had ever changed status,
-- and the trip had zero bookings. The lifecycle had never fired even once.
--
-- THE MISSING STEP. `planned` means "this is on a day". The option becomes an
-- itinerary item in one tap, and `itinerary_item_id` records which one, exactly
-- as `booking_id` already records the booking a promoted option became.
-- `booked` keeps its meaning for the hotels that get a real reservation.
--
-- `shortlist` is deliberately left in place. It has zero rows and arguably adds
-- a step nobody used, but dropping a value from a CHECK constraint is not worth
-- doing while the question is still open (docs/DESIGN-options-bank.md).
--
-- ON DELETE SET NULL mirrors the booking_id decision from 00020: removing the
-- item from the day should not erase the fact that the place was considered.

alter table place_options
  add column itinerary_item_id uuid references itinerary_items(id) on delete set null;

comment on column place_options.itinerary_item_id is
  'The itinerary item this option became, when status = ''planned''. '
  'Nulled rather than cascading if that item is deleted, so the bank keeps '
  'the planning history. See migration 00029.';

alter table place_options
  drop constraint place_options_status_check;

alter table place_options
  add constraint place_options_status_check
    check (status in ('option', 'shortlist', 'planned', 'booked', 'rejected'));

-- FK index, matching the convention established in 00012_fk_indexes.
create index idx_place_options_itinerary_item_id
  on place_options(itinerary_item_id);

-- The day picker asks "which options are still undecided in this country?" on
-- every open, so it gets a covering index rather than a filter over the trip.
create index idx_place_options_trip_cc_status
  on place_options(trip_id, country_code, status);

-- No RLS change. place_options_owner_all (00020) is `for all` over the whole
-- table, and planning content stays owner-only: kids and guests have no policy
-- on place_options at all (CLAUDE.md rule #2).

-- ---------------------------------------------------------------------------
-- Schema drift, reconciled here rather than left to rot.
--
-- `geocode_attempts` exists on the live table but appears in NO migration and
-- in NO code — it was added straight to the database at some point, which
-- CLAUDE.md forbids precisely because the repo then stops describing reality.
-- It is all zeros. Rather than drop a column somebody meant to use, this
-- records it, and geocode-places starts honouring it: with the new precision
-- guard a name the geocoder cannot resolve now fails instead of silently
-- landing on a country, so without a cap those rows would be retried on every
-- single run forever.
-- ---------------------------------------------------------------------------
alter table place_options
  add column if not exists geocode_attempts integer not null default 0;

comment on column place_options.geocode_attempts is
  'How many times geocoding has failed for this row. geocode-places skips a '
  'row once it reaches GEOCODE_MAX_ATTEMPTS so a permanently unresolvable '
  'name stops consuming every batch. Reset to 0 to try again.';
