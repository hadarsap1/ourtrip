-- Rollback for 00112. No more pushes on friend chat messages, to anyone; the
-- chat and its unread counts (00110) are untouched.
select cron.unschedule('push-friend-messages')
where exists (select 1 from cron.job where jobname = 'push-friend-messages');
drop trigger if exists friend_messages_notify on public.friend_messages;
drop function if exists public.notify_friend_message();
drop function if exists public.claim_friend_pushes(uuid);
drop table if exists public.friend_push_state;
drop table if exists public.friend_push_settings;
