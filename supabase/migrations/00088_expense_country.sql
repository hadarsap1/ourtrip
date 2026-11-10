-- Which country an expense belongs to (DECISIONS #59).
--
-- Hadar 10/11/2026: the budget holds bookings already paid for Japan while the
-- family is in Vietnam, and he wants to know where he stands in Vietnam alone.
-- The budget placed every expense in the country of the day it was paid, so a
-- Japan hotel paid from Hanoi counted as Vietnam.
--
-- The client now places an expense by what it pays for: a linked booking's
-- dates (a hotel spread over its nights), otherwise the day it was paid
-- (lib/budgetInsights.ts). This column is the manual override for the rest:
-- null = automatic, an ISO 3166-1 alpha-2 code = that country.
--
-- RLS coverage: no new policy. The column is on `expenses`, covered by
-- expenses_owner_all (00001, read once per query since 00086): owners only,
-- kids and guests read and write nothing.

alter table public.expenses
  add column if not exists country_code text;

alter table public.expenses
  drop constraint if exists expenses_country_code_format;
alter table public.expenses
  add constraint expenses_country_code_format
    check (country_code is null or country_code ~ '^[A-Z]{2}$');
