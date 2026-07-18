-- Sprint 8: "מה בסביבה" recommendations maybe-list (SPEC 2.8).
-- Recommendations are generated on demand by the `recommend` Edge Function and
-- are ephemeral; the owner either saves one straight into the itinerary
-- (itinerary_items, existing table) or parks it here as a "maybe". Owner-only —
-- planning content, never visible to kids or guests (CLAUDE.md rule #2).

create table saved_recommendations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  title text not null,
  category text,
  description text,
  location_name text,
  lat double precision,
  lng double precision,
  place_id text,
  country_code text,
  maps_url text,
  created_by uuid references members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table saved_recommendations enable row level security;

create policy saved_recommendations_owner_all on saved_recommendations
  for all using (public.is_owner_of(trip_id))
  with check (public.is_owner_of(trip_id));

create trigger saved_recommendations_set_updated_at
  before update on saved_recommendations
  for each row execute function public.set_updated_at();
