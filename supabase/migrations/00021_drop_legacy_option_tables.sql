-- Drops the two tables place_options replaced (00020).
--
-- APPLY ONLY AFTER the code that reads them is deployed. Until then the live
-- site still queries saved_links from the /links screen, and dropping it early
-- breaks that screen in production. 00020 was deliberately additive for this
-- reason; this is the second half, run once the new build is live.
--
-- Safe to run: both tables were empty (verified 2026-08-15 — 0 rows each), so
-- nothing is lost. Their policies, triggers and indexes go with them.

drop table if exists saved_links;
drop table if exists saved_recommendations;
