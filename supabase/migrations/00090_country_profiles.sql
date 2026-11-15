-- "הידעת" - a card about each COUNTRY, above the per-stretch facts.
--
-- WHY A SEPARATE TABLE. destination_facts (00032) is keyed by stretch, so
-- Japan is eight destinations. The flag, the population and the capital are
-- the same in Kyoto and in Sapporo; putting them in the stretch facts would
-- repeat "the red circle is the sun" eight times and let the copies drift
-- apart when a parent fixes one. One row per (trip, country) is shown on every
-- stretch of that country.
--
-- WHY TEXT COLUMNS, NOT NUMBERS. Every value is a sentence a 7-year-old reads
-- ("בערך 125 מיליון איש - פי 13 מישראל"), not data the app computes with.
-- Population is deliberately rounded: it changes every year, and a rounded
-- figure stays true for the length of the trip. Each column is nullable so a
-- parent can clear a line they are not sure of rather than leave it wrong.

create table country_profiles (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  -- what the flag shows and why it looks like that, 2-4 short sentences
  flag_meaning text,
  population text,
  capital text,
  language text,
  currency text,
  size_vs_israel text,
  -- a national animal or flower, with one line about it
  national_symbol text,
  -- 'ai' until a parent edits it, so a regenerate can warn before overwriting
  -- their changes
  source text not null default 'ai' check (source in ('ai', 'manual')),
  updated_by uuid references members(id),
  updated_at timestamptz not null default now(),
  unique (trip_id, country_code)
);

alter table country_profiles enable row level security;

-- Same shape as destination_facts: owners write, kids read, guests nothing.
create policy country_profiles_owner_all on country_profiles
  for all using (public.is_owner_of(trip_id))
  with check (public.is_owner_of(trip_id));

create policy country_profiles_kid_select on country_profiles
  for select using (public.is_kid_of(trip_id));

-- Guests get no policy: nothing here has a sharing flag to honour, and the
-- schema's default is that a guest sees only what was deliberately shared.
