-- Rollback for 00040_push_v2_schedules.sql. Removes only the two jobs it added.
select cron.unschedule('push-hourly') where exists (select 1 from cron.job where jobname = 'push-hourly');
select cron.unschedule('push-leave-now') where exists (select 1 from cron.job where jobname = 'push-leave-now');
