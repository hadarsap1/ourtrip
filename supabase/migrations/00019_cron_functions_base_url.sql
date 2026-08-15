-- Centralise the Edge Functions base URL used by the three pg_cron jobs.
--
-- Before this migration each job body hardcoded the full project URL. If the
-- project ref ever changed, all three jobs would POST into the void while
-- cron.job_run_details still reported "succeeded" — net.http_post only queues
-- the request, so the SQL succeeds even when the HTTP call goes nowhere. FX
-- would go stale, push would stop and the weekly backup would stop running,
-- with nothing surfacing the failure.
--
-- One helper now owns the URL. To point the jobs at a different project, no
-- migration is needed:
--
--   alter database postgres
--     set app.settings.functions_base_url = 'https://<ref>.supabase.co/functions/v1';
--
-- With no override set it falls back to the current project, so applying this
-- is behaviourally a no-op on the existing database.

create or replace function public.functions_base_url()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('app.settings.functions_base_url', true), ''),
    'https://xeqfcrxrpfjlqhkijrwd.supabase.co/functions/v1'
  );
$$;

comment on function public.functions_base_url() is
  'Base URL for Edge Function invocations from pg_cron. Override with '
  '`alter database postgres set app.settings.functions_base_url = ...`.';

-- Same posture as the other internal helpers (00002_function_hardening):
-- nothing client-facing needs to call this.
revoke execute on function public.functions_base_url() from public;
revoke execute on function public.functions_base_url() from anon;
revoke execute on function public.functions_base_url() from authenticated;

-- Re-schedule the three jobs. cron.schedule() replaces a job of the same name,
-- so schedules, headers and bodies below are identical to the originals
-- (00004, 00010) apart from the URL.
--
-- The helper is called INSIDE the job body, not interpolated when this
-- migration runs — so the URL is resolved afresh on every firing and an
-- `alter database ... set app.settings.functions_base_url` takes effect on the
-- next run with no migration and no redeploy.

select cron.schedule(
  'fx-daily',
  '30 4 * * *',
  $job$
  select net.http_post(
    url := public.functions_base_url() || '/fx-daily',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $job$
);

select cron.schedule(
  'push-daily',
  '0 5 * * *',
  $job$
  select net.http_post(
    url := public.functions_base_url() || '/push-send',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"type": "daily"}'::jsonb
  );
  $job$
);

select cron.schedule(
  'backup-weekly',
  '0 3 * * 0',
  $job$
  select net.http_post(
    url := public.functions_base_url() || '/backup-weekly',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $job$
);
