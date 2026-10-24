-- Rollback for 00042. Drops step counts and phone tokens (phones stop syncing).
drop table if exists public.step_tokens;
drop table if exists public.daily_steps;
