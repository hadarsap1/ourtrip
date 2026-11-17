-- country_profiles (00090) in the once-per-query form of 00059 / 00086.
--
-- 00090 was written with is_owner_of(trip_id) / is_kid_of(trip_id), the
-- per-row form 00086 had just removed from every other table. The table is
-- tiny (one row per country), so the cost was small, but the guard in
-- scripts/rls/probes/86_rls_once_per_query_rest.sql failed on it and
-- run.sh stops at the first failing probe - probes 87-93 did not run in a
-- full harness pass (QA 15/11/2026).
--
-- Same access as before: parents read and write their own trip's cards, kids
-- read them, guests / revoked guests / anon / other trips get nothing.
-- Probe: scripts/rls/probes/90_country_profiles.sql.

alter policy country_profiles_owner_all on public.country_profiles
  using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));

alter policy country_profiles_kid_select on public.country_profiles
  using (trip_id = (select public.member_trip_as('kid')));
