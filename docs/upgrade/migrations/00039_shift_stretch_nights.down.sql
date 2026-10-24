-- Rollback for 00039. Drops the function only; no data was changed by creating it.
drop function if exists public.shift_stretch_nights(uuid, date, int);
