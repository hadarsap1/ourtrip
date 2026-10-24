-- Applied to production 04/10/2026 (cron jobs 11 and 12), after push-send v13
-- with the 1.11 handlers was deployed and smoke-tested (hourly -> 200 OK).
--
-- 1.11 notifications: two more pg_cron jobs calling push-send.
--   push-hourly    every hour at :00 UTC. push-send converts to the family's
--                  local time (zone of today's itinerary country) and fires
--                  09:00 deadlines, 19:00 tomorrow digest, 20:00 evening journal.
--                  Quiet hours 22:00-07:00 local are enforced in the function.
--   push-leave-now every 15 minutes. Leave-by of the next placed item falls in
--                  the coming 15 minutes -> owners.
--
-- No schema change, no data change. Same auth as 00025 (x-cron-secret).
-- Kill switch without a migration: set NOTIFY_V2=off on the push-send function.
-- Rollback: docs/upgrade/migrations/00040_push_v2_schedules.down.sql.

select cron.schedule(
  'push-hourly',
  '0 * * * *',
  $job$
  select net.http_post(
    url := public.functions_base_url() || '/push-send',
    headers := public.cron_secret_header(),
    body := '{"type": "hourly"}'::jsonb
  );
  $job$
);

select cron.schedule(
  'push-leave-now',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := public.functions_base_url() || '/push-send',
    headers := public.cron_secret_header(),
    body := '{"type": "leave-now"}'::jsonb
  );
  $job$
);
