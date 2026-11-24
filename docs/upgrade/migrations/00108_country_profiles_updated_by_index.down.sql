-- Rollback for 00108. Only drops the index; nothing reads it by name.
drop index if exists public.idx_country_profiles_updated_by;
