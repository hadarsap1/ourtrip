-- "הידעת" - short facts about each destination, written for the kids.
--
-- KEYED BY STRETCH, NOT BY COUNTRY. The itinerary is 14 stretches across 6
-- countries: Japan alone is Kyoto, Osaka, Kanazawa, Hakone, Tokyo, Sapporo,
-- Biei and Lake Toya, while Thailand is one 38-day block. Keying facts to the
-- country would give a kid the same handful of facts for 38 days and lump
-- Tokyo in with Hokkaido. A destination is therefore (country_code,
-- location_name) - exactly the grouping itinerary_days already has.
--
-- Renaming a stretch in the itinerary orphans its facts rather than corrupting
-- them: the rows stay, they simply stop matching. That is recoverable by hand
-- and is the cheaper failure than inventing a destinations table nothing else
-- needs.

create table destination_facts (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  country_code text not null,
  location_name text not null,
  fact text not null,
  -- One emoji, shown as the card's icon. Optional: a fact with none still
  -- renders, with a neutral marker.
  emoji text,
  sort_order integer not null default 0,
  -- Where the text came from, so a regenerate can replace the AI batch without
  -- touching anything a parent wrote by hand.
  source text not null default 'ai' check (source in ('ai', 'manual')),
  created_by uuid references members(id),
  created_at timestamptz not null default now()
);

create index destination_facts_lookup
  on destination_facts (trip_id, country_code, location_name, sort_order);

alter table destination_facts enable row level security;

-- Owners write and curate.
create policy destination_facts_owner_all on destination_facts
  for all using (public.is_owner_of(trip_id))
  with check (public.is_owner_of(trip_id));

-- Kids read, and only read. This is the whole point of the feature: the kids
-- open it themselves. They cannot insert, edit or delete, so nothing a kid
-- does can change what the other kid reads.
create policy destination_facts_kid_select on destination_facts
  for select using (public.is_kid_of(trip_id));

-- Guests get NO policy at all, so the table is invisible to them. Facts are
-- harmless, but the default in this schema is that a guest sees only what was
-- deliberately shared, and nothing here has a sharing flag to honour.
