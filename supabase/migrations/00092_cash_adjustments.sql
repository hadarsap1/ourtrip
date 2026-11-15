-- Correcting the cash wallet by hand (DECISIONS #61, after #60).
--
-- Hadar 15/11/2026: he counts the cash in the wallet and wants to set what is
-- really there. Answers he gave: he types the actual balance (not a plus or
-- minus); the correction does not change the budget total (the cash already
-- counts from its withdrawal - whatever is missing was spent unlogged, and is
-- already inside it); the last correction shows under the wallet and can be
-- undone; it is per currency, the wallet it was made on.
--
-- One row per correction. `balance` is what he typed; `delta` is how far it
-- moved the wallet (typed - what the app computed at that moment). The wallet
-- of a currency is withdrawals - cash expenses + the deltas of its
-- corrections, never shown below zero (lib/budget.ts cashWallets). Undo =
-- delete the row.
--
-- RLS coverage: cash_adjustments_owner_all - owners only, like the rest of the
-- budget. Kids and guests get no policy, so they read and write nothing
-- (CLAUDE.md rule 2). Realtime delivers a row only to subscribers the SELECT
-- policy admits.

create table if not exists public.cash_adjustments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  balance numeric(16,2) not null check (balance >= 0),
  delta numeric(16,2) not null,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_cash_adjustments_trip_id
  on public.cash_adjustments (trip_id, currency, created_at);
create index if not exists idx_cash_adjustments_created_by
  on public.cash_adjustments (created_by);

alter table public.cash_adjustments enable row level security;

drop policy if exists cash_adjustments_owner_all on public.cash_adjustments;
create policy cash_adjustments_owner_all on public.cash_adjustments
  for all
  using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));

-- the other phone sees a correction on the budget screen (subscribeBudget)
alter publication supabase_realtime add table public.cash_adjustments;
