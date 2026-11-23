-- Comments and likes reach the parents by push (Hadar 23/11/2026, DECISIONS
-- #74, amends #51 "in-app only"): "so I don't have to open the app to check
-- new comments". His choices: parents only; comments AND likes; a quiet
-- notification (no sound, repeats folded into one) plus a number on the app
-- icon on the home screen, cleared when the app is opened; nothing 22:00-07:00
-- in the family's local time, held and sent at 07:00.
--
-- Who is told is decided in push-send with the service role: the trip's
-- owners, except the one who wrote the comment or the like. Owners already
-- read every comment and like (comments_owner_all, reactions_owner_all), so a
-- push never shows them anything they could not open. Kids and guests get no
-- push from this at all.
--
-- Each comment or like is told once: push-send claims it in feedback_pushes
-- (insert, on conflict nothing) before sending, so the trigger call and the
-- sweep never both send it. What exists when this ships is not news.
--
-- Rollback: docs/upgrade/migrations/00104_feedback_push.down.sql.

create table feedback_pushes (
  -- a comments.id or a reactions.id (both uuids, never the same value)
  target_id uuid primary key,
  kind text not null check (kind in ('comment', 'reaction')),
  trip_id uuid not null references trips(id),
  sent_at timestamptz not null default now()
);

comment on table feedback_pushes is
  'Comments and likes the parents were already told about by push (00104). '
  'Service role only: RLS on, no policies.';

create index idx_feedback_pushes_trip_sent on feedback_pushes(trip_id, sent_at);

alter table feedback_pushes enable row level security;
-- no policy on purpose: only push-send (service role) reads and writes it
revoke all on feedback_pushes from anon, authenticated;

-- what is already there is not news: never push it
insert into feedback_pushes (target_id, kind, trip_id)
select id, 'comment', trip_id from comments
on conflict do nothing;

insert into feedback_pushes (target_id, kind, trip_id)
select id, 'reaction', trip_id from reactions
on conflict do nothing;

-- ============ triggers: ask push-send to look, right away ============
-- The body carries no id: push-send reads the recent comments and likes not
-- yet told, so a forged call can at most send a due push a little earlier.

create or replace function public.notify_feedback()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := public.functions_base_url() || '/push-send',
    headers := public.cron_secret_header(),
    body := '{"type": "feedback"}'::jsonb
  );
  return new;
end;
$$;

revoke execute on function public.notify_feedback() from public, anon, authenticated;

create trigger comments_notify_parents
  after insert on comments
  for each row execute function public.notify_feedback();

create trigger reactions_notify_parents
  after insert on reactions
  for each row execute function public.notify_feedback();

-- ============ sweep: what came in during quiet hours goes out at 07:00 ============

select cron.schedule(
  'push-feedback',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := public.functions_base_url() || '/push-send',
    headers := public.cron_secret_header(),
    body := '{"type": "feedback"}'::jsonb
  );
  $job$
);
