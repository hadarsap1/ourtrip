-- Budget live sync. The budget tables were never added to the realtime
-- publication, so a new expense - from the other parent's phone, or from the
-- capture button on this one - reached the budget screen only when it was
-- opened again.
--
-- RLS coverage: realtime delivers a row only to subscribers its SELECT policy
-- admits - expenses_owner_all, budget_categories_owner_all (00001) and the
-- trip_budget owner policy (00056). Kids and guests get no events.

alter publication supabase_realtime add table public.expenses;
alter publication supabase_realtime add table public.budget_categories;
alter publication supabase_realtime add table public.trip_budget;
