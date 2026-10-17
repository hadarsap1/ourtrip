-- The trip's overall budget moves off `trips` into an owner-only table
-- (QA 17/10/2026, hard rule 2).
--
-- 00022 put it on trips as `total_budget`, and its security check reasoned
-- that "a column inherits its table's policies". It does - and trips is
-- readable by every member, because kids and guests need the trip's name and
-- dates. So a kid or a guest could read the budget straight from the API
-- (select total_budget from trips), and a guest opening the app for the first
-- time after approval saw "₪180,000 left for the trip" on screen. RLS works on
-- rows, not columns, so the only fix at the database is to put the number in
-- a row only an owner can read - the same reason 00053 gave trip_ai_settings
-- its own table.
--
-- No row = no overall budget set, and the screen derives the total from the
-- categories, exactly as NULL on trips meant before.

create table public.trip_budget (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  total_budget numeric(12,2) not null check (total_budget >= 0),
  updated_at timestamptz not null default now()
);

comment on table public.trip_budget is
  'Overall trip budget in the trip base currency. Owners only. Migration 00056 (was trips.total_budget).';

alter table public.trip_budget enable row level security;

create policy trip_budget_owner_all on public.trip_budget
  for all using (public.is_owner_of(trip_id)) with check (public.is_owner_of(trip_id));

revoke all on public.trip_budget from anon;

create trigger trip_budget_set_updated_at
  before update on public.trip_budget
  for each row execute function public.set_updated_at();

insert into public.trip_budget (trip_id, total_budget)
select id, total_budget from public.trips where total_budget is not null
on conflict (trip_id) do nothing;

alter table public.trips drop constraint if exists trips_total_budget_check;
alter table public.trips drop column if exists total_budget;
