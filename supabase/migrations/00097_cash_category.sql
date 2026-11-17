-- A category of its own for cash withdrawals ("מזומן").
--
-- An ATM withdrawal is a lump of everyday spending (food, taxis, small
-- purchases) that is not itemised. Until now it had to sit under one of the
-- ordinary categories and ended up under "קניות", which skewed that category.
-- Purchases itemised from the cash stay in their real category (DECISIONS #52,
-- #60); only the withdrawal itself - what is left of it, the unitemised cash -
-- lives here.
--
-- Idempotent: inserts the category only where the trip lacks it, and only
-- moves withdrawals that are not already in it. No policy change: both tables
-- are owner-only (budget_categories_owner_all, expenses_owner_all).

insert into budget_categories (trip_id, key, label_he)
select t.id, 'cash', 'מזומן'
from trips t
where not exists (
  select 1 from budget_categories c
  where c.trip_id = t.id and c.key = 'cash'
);

update expenses e
set category_id = c.id
from budget_categories c
where c.trip_id = e.trip_id
  and c.key = 'cash'
  and e.is_cash_withdrawal
  and e.category_id <> c.id;
