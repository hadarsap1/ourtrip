-- Rollback for 00101. Guests stop getting the daily email; who asked for it is lost.
select cron.unschedule('guest-email-digest')
where exists (select 1 from cron.job where jobname = 'guest-email-digest');
drop function if exists public.unsubscribe_guest_email(uuid);
drop table if exists public.guest_email_optins;
