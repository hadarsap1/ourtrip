-- Rollback for 00107_home_dashboard.sql. The app falls back to its separate
-- queries when the function is missing (lib/data/homeRpc.ts).

drop function if exists public.home_dashboard(date, date);
