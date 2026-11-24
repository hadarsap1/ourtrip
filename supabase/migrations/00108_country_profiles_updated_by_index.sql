-- Index the one foreign key the performance advisor still lists (QA 24/11/2026):
-- country_profiles.updated_by -> members. Without it, deleting or re-keying a
-- member scans country_profiles. Same pattern as 00086's created_by indexes.
-- No change to access: RLS and grants are untouched.
--
-- Rollback: docs/upgrade/migrations/00108_country_profiles_updated_by_index.down.sql.

create index if not exists idx_country_profiles_updated_by on country_profiles (updated_by);
