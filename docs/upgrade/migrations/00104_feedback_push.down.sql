-- Rollback for 00104. Parents stop getting pushes on comments and likes; the
-- in-app "new" marks (00081) are untouched.
select cron.unschedule('push-feedback')
where exists (select 1 from cron.job where jobname = 'push-feedback');
drop trigger if exists comments_notify_parents on public.comments;
drop trigger if exists reactions_notify_parents on public.reactions;
drop function if exists public.notify_feedback();
drop table if exists public.feedback_pushes;
