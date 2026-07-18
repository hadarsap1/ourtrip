-- Saved links (bookmarks) organized by country + area — e.g. Facebook posts,
-- blog articles, tips the owners collect while planning. Owner-only planning
-- content (CLAUDE.md rule #2: kids/guests never read unshared content).
-- `country` / `area` are free text (friendly labels, not ISO codes) so the
-- owners can group however they like.

create table saved_links (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  country text,
  area text,
  title text not null,
  url text not null,
  note text,
  created_by uuid references members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table saved_links enable row level security;

create policy saved_links_owner_all on saved_links
  for all using (public.is_owner_of(trip_id))
  with check (public.is_owner_of(trip_id));

create trigger saved_links_set_updated_at
  before update on saved_links
  for each row execute function public.set_updated_at();

create index idx_saved_links_trip_id on saved_links(trip_id);
