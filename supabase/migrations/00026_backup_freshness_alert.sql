-- Alert when the weekly backup goes stale.
--
-- WHY. On 2026-08-29 the weekly backup was found dead for three weeks:
-- migration 00021 dropped `saved_recommendations`, `backup-weekly` still
-- selected it, every run returned 500 before writing anything — and nothing
-- noticed. The reason nothing noticed is structural, not a one-off:
--
--   * `cron.job_run_details` records SUCCESS, because the job's SQL is
--     `select net.http_post(...)`, which only QUEUES a request. It succeeds
--     whether the Edge Function returns 200, 500, or never answers at all.
--   * the only real signal is the HTTP response in `net._http_response`, or
--     the absence of a fresh object in the `backups` bucket.
--
-- So the fix for the backup is not enough on its own. This adds the missing
-- feedback loop: once a week, look at what actually landed in the bucket, and
-- push a notification to the owners if the newest backup is too old.
--
-- Threshold is 8 days, not 7: the backup runs Sunday 03:00 UTC and this check
-- runs Monday 04:00 UTC, so a healthy system is always ~25 hours stale. Eight
-- days fires after exactly one missed run, with no false alarm from ordinary
-- timing jitter.
--
-- This deliberately does NOT try to repair anything. A backup that failed
-- needs a person to look at why; silently retrying would just hide the next
-- structural break the way the last one was hidden.

create or replace function public.check_backup_freshness()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_newest timestamptz;
  v_age_days numeric;
  v_trip uuid;
begin
  select max(created_at) into v_newest
  from storage.objects
  where bucket_id = 'backups';

  -- No backup has EVER landed: that is its own alarm, and the age arithmetic
  -- below would be meaningless.
  if v_newest is null then
    perform net.http_post(
      url := public.functions_base_url() || '/push-send',
      headers := public.cron_secret_header(),
      body := jsonb_build_object(
        'type', 'backup-stale',
        'age_days', -1
      )
    );
    return jsonb_build_object('ok', false, 'reason', 'no backups at all');
  end if;

  v_age_days := extract(epoch from (now() - v_newest)) / 86400.0;

  if v_age_days <= 8 then
    return jsonb_build_object('ok', true, 'age_days', round(v_age_days, 2));
  end if;

  select id into v_trip from trips where is_active limit 1;

  perform net.http_post(
    url := public.functions_base_url() || '/push-send',
    headers := public.cron_secret_header(),
    body := jsonb_build_object(
      'type', 'backup-stale',
      'age_days', round(v_age_days, 1),
      'trip_id', v_trip
    )
  );

  return jsonb_build_object('ok', false, 'age_days', round(v_age_days, 2));
end;
$$;

comment on function public.check_backup_freshness() is
  'Weekly guard: pushes an alert to owners when the newest object in the '
  '`backups` bucket is older than 8 days. Exists because cron.job_run_details '
  'reports success for a merely-queued net.http_post, so a failing backup is '
  'otherwise invisible. See migration 00026.';

-- Internal only, like the other cron helpers (00002, 00019, 00025).
revoke execute on function public.check_backup_freshness() from public;
revoke execute on function public.check_backup_freshness() from anon;
revoke execute on function public.check_backup_freshness() from authenticated;

-- Monday 04:00 UTC — the morning after the Sunday 03:00 backup.
select cron.unschedule('backup-freshness')
where exists (select 1 from cron.job where jobname = 'backup-freshness');

select cron.schedule(
  'backup-freshness',
  '0 4 * * 1',
  $job$ select public.check_backup_freshness(); $job$
);
