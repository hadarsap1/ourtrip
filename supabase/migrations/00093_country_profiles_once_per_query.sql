-- country_profiles (00090) in once-per-query form, like every other read
-- policy since 00059 / 00086.
--
-- 00090 wrote its policies with is_owner_of(trip_id) / is_kid_of(trip_id),
-- which Postgres runs once per row; the guard in probe 86 catches exactly
-- that. Same access, written as `trip_id = (select member_trip_as(role))`,
-- which runs once per query (an InitPlan):
--   is_owner_of(t) <=> t = member_trip_as('owner')
--   is_kid_of(t)   <=> t = member_trip_as('kid')
-- (both go through current_member_id(), so kid device revocation still
-- applies; a null - not that role - matches no row, like false).
--
-- RLS coverage: no policy added or removed. Owners read and write their trip's
-- profiles; kids read them; guests still have no policy and read nothing.

alter policy country_profiles_owner_all on public.country_profiles
  using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));

alter policy country_profiles_kid_select on public.country_profiles
  using (trip_id = (select public.member_trip_as('kid')));
