-- A daily email to guests about what is new (Hadar 19/11/2026, DECISIONS #72).
-- For a guest who only opens the app in a browser, above all on an iPhone,
-- where there is no push before "add to home screen" (#71).
--
--   * opt-in: a guest turns it on in settings or on the iPhone card; on = a
--     guest_email_optins row of their own. Off by default.
--   * one email a day, 08:00 Israel time, only when something new was shared
--     with that guest since the last one: the updates and podcast episodes
--     push-send recorded in guest_update_pushes (00100), filtered by what the
--     guest may see now (same rule as the guest policies,
--     _shared/guestUpdates.ts) - an update unpublished since is left out.
--   * sent from the family's Gmail over SMTPS (port 465; Supabase blocks 25
--     and 587) by the guest-digest function. Without GMAIL_USER and
--     GMAIL_APP_PASSWORD secrets it sends nothing.
--   * every email carries a one-click unsubscribe link: /email-off/<token>,
--     no sign-in needed, through unsubscribe_guest_email() below.
--
-- Rollback: docs/upgrade/migrations/00101_guest_email_digest.down.sql.

create table guest_email_optins (
  member_id uuid primary key references members(id) on delete cascade,
  trip_id uuid not null references trips(id),
  -- the unsubscribe link; a guest reading their own row sees only their own
  unsubscribe_token uuid not null unique default gen_random_uuid(),
  -- nothing shared before turning it on is sent
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table guest_email_optins is
  'Guests who asked for the daily email (00101). Own row only; guest-digest '
  '(service role) sends and moves last_sent_at.';

create index idx_guest_email_optins_trip_id on guest_email_optins(trip_id);

alter table guest_email_optins enable row level security;

-- an active guest reads, adds and removes their own row, nothing else
create policy guest_email_optins_self_select on guest_email_optins
  for select using (
    member_id = (select public.current_member_id())
    and trip_id = (select public.active_guest_trip())
  );

create policy guest_email_optins_self_insert on guest_email_optins
  for insert with check (
    member_id = (select public.current_member_id())
    and trip_id = (select public.active_guest_trip())
  );

create policy guest_email_optins_self_delete on guest_email_optins
  for delete using (
    member_id = (select public.current_member_id())
    and trip_id = (select public.active_guest_trip())
  );

-- no update policy; and a guest names only who and which trip - the token and
-- the clock are the database's
revoke all on guest_email_optins from anon;
revoke insert, update on guest_email_optins from authenticated;
grant insert (member_id, trip_id) on guest_email_optins to authenticated;

-- ============ unsubscribe without signing in ============

create or replace function public.unsubscribe_guest_email(p_token uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  n int;
begin
  delete from guest_email_optins where unsubscribe_token = p_token;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke execute on function public.unsubscribe_guest_email(uuid) from public;
grant execute on function public.unsubscribe_guest_email(uuid) to anon, authenticated;

-- ============ schedule ============
-- Hourly; guest-digest sends only in the 08:00 hour in Israel (summer and
-- winter time both) and moves last_sent_at, so a second call sends nothing.

select cron.schedule(
  'guest-email-digest',
  '0 * * * *',
  $job$
  select net.http_post(
    url := public.functions_base_url() || '/guest-digest',
    headers := public.cron_secret_header(),
    body := '{}'::jsonb
  );
  $job$
);
