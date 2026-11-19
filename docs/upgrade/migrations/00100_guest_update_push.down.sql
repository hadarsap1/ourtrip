-- Rollback for 00100. Guests stop getting pushes on updates and episodes; their
-- push_subscriptions rows stay (push-send sends guests nothing else).
select cron.unschedule('push-guest-updates')
where exists (select 1 from cron.job where jobname = 'push-guest-updates');
drop trigger if exists posts_notify_guests on public.posts;
drop trigger if exists episodes_notify_guests on public.episodes;
drop function if exists public.notify_guest_updates();
drop table if exists public.guest_update_pushes;
