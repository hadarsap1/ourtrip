-- Visas and entry permits, per country and per requirement.
--
-- WRITTEN AFTER THE FACT, AND DELIBERATELY IDEMPOTENT. The table was created
-- directly on the live project while the visa research was being done, so this
-- file is not what built it - it is what lets a fresh environment rebuild it
-- (CLAUDE.md: every schema change goes through a migration). Every statement
-- is guarded, so running it against the live project changes nothing and
-- touches no row.
--
-- WHY THE TABLE LOOKS LIKE THIS. A visa link is not the content; the date it
-- was last checked is. Thailand cut its visa exemption from 60 to 30 days in
-- the middle of this trip's planning, which turned a correct bookmark into a
-- wrong one without changing a pixel. Hence `verified_at`: null means nobody
-- has confirmed this rule, and the screen says so in the loudest thing on it.
--
-- One row per requirement, not per country: a country can need a visa, an
-- arrival card and an extension at once, and each has its own link, fee and
-- deadline. `sort_order` carries the route order, so the screen never has to
-- guess which country comes first.

create table if not exists visa_requirements (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  country_code text not null,
  country_he text not null,
  requirement_type text not null default 'visa'
    check (requirement_type in ('visa', 'arrival_card', 'extension', 'none')),
  title_he text not null,
  official_url text,
  -- Longest stay this permission allows, in days. Null where the rule has no
  -- day limit (an arrival card is a form, not a permission).
  max_days integer,
  fee_note text,
  deadline_note text,
  status text not null default 'todo'
    check (status in ('todo', 'submitted', 'approved', 'not_needed')),
  -- Date the rule was last checked against the official source. Null is not
  -- "missing data", it is "do not trust this row yet".
  verified_at date,
  source text not null default 'manual',
  sort_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Display order is (trip, country, sort_order) and nothing else queries it.
create index if not exists visa_requirements_trip_country_idx
  on visa_requirements (trip_id, country_code, sort_order);

create or replace function visa_requirements_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists visa_requirements_touch on visa_requirements;
create trigger visa_requirements_touch
  before update on visa_requirements
  for each row execute function visa_requirements_touch_updated_at();

alter table visa_requirements enable row level security;

-- Owners only. Visa status is trip admin, in the same class as documents and
-- budget: kids and guests get no policy at all, so no row of this table can
-- appear in any response of theirs (CLAUDE.md hard rule #2).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'visa_requirements'
      and policyname = 'visa_requirements_owner_all'
  ) then
    create policy visa_requirements_owner_all on visa_requirements
      for all using (is_owner_of(trip_id));
  end if;
end $$;
