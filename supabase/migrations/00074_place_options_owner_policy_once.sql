-- Saving the places a pasted post found failed with "statement timeout" once
-- a post held more than about a dozen of them (26/10).
--
-- The country-code trigger (00071) looks the code up among the trip's other
-- options, and it runs as the saving owner, so place_options_owner_all was
-- checked on every option it scanned: is_owner_of(trip_id), a member lookup
-- per row, ~1,200 rows, for every row inserted. Measured in production as an
-- owner, rolled back: 10 rows 6.3 s (the API's limit is 8 s); with this
-- policy 30 rows 0.46 s, codes still filled.
--
-- Same rule in 00059's once-per-query form:
--   is_owner_of(t) <=> t = member_trip_as('owner')
-- wrapped in (select ...) so Postgres evaluates it once. Who can read or write
-- an option does not change. Probe: scripts/rls/probes/74_place_options_owner_once.sql

alter policy place_options_owner_all on place_options
  using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));
