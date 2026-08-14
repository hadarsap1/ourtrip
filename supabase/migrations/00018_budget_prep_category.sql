-- Pre-trip preparation budget category.
--
-- Vaccinations, visas, passports, travel insurance and gear are real trip
-- spending that happens BEFORE departure, and more of it keeps arriving (the
-- family has further vaccination rounds ahead). Until now those landed in
-- בלת"מ (misc), which hid them among on-trip odds and ends.
--
-- Idempotent: only inserts where the trip doesn't already have the category,
-- so it is safe to re-run and safe on trips created after this migration.

insert into budget_categories (trip_id, key, label_he)
select t.id, 'prep', 'הכנות לטיול'
from trips t
where not exists (
  select 1 from budget_categories c
  where c.trip_id = t.id and c.key = 'prep'
);
