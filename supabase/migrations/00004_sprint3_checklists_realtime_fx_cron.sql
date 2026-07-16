-- Sprint 3: checklists realtime + scheduled daily FX fetch.
--
-- RLS coverage for this sprint's features (all pre-existing from 00001):
--   budget_categories_owner_all, expenses_owner_all, checklists_owner_all,
--   checklist_items_owner_all, fx_rates_member_select (writes are service-role
--   only, performed by the fx-daily Edge Function).

-- ============ REALTIME ============
-- Live check-off sync between devices (Sprint 3 acceptance criterion).

alter publication supabase_realtime add table public.checklists;
alter publication supabase_realtime add table public.checklist_items;

-- ============ DAILY FX FETCH ============
-- pg_cron invokes the fx-daily Edge Function (deployed separately from
-- supabase/functions/fx-daily/) every morning. The function is deployed with
-- verify_jwt=false — idempotent upsert of public data — so no key is embedded
-- here. 04:30 UTC = 06:30/07:30 Israel time, before the family's day starts.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('fx-daily')
where exists (select 1 from cron.job where jobname = 'fx-daily');

select cron.schedule(
  'fx-daily',
  '30 4 * * *',
  $$
  select net.http_post(
    url := 'https://xeqfcrxrpfjlqhkijrwd.supabase.co/functions/v1/fx-daily',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
