-- An overall budget for the trip, set directly rather than inferred.
--
-- Until now the "total" on the budget screen was the SUM of the per-category
-- planned amounts, so there was no way to say "we have 60,000 for this trip"
-- and then divide it up — the only way to move the total was to move a
-- category. That is backwards from how the number actually gets decided.
--
-- Nullable on purpose: with no value set the screen keeps deriving the total
-- from the categories exactly as before, so nothing changes for anyone who
-- never sets one. When it IS set, it becomes the total and the categories
-- read as allocations within it.
--
-- numeric(12,2) matches budget_categories.planned_amount, and the check keeps
-- a stray negative out; clearing the budget is done with NULL, not -1.

alter table trips
  add column if not exists total_budget numeric(12,2);

alter table trips
  drop constraint if exists trips_total_budget_check;

alter table trips
  add constraint trips_total_budget_check
  check (total_budget is null or total_budget >= 0);

comment on column trips.total_budget is
  'Overall trip budget in the trip base currency. NULL = derive the total from the sum of budget_categories.planned_amount, which is the historical behaviour.';
