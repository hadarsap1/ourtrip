-- Phase 2: per-member daily AI call counts, for real rate limits and a daily
-- cap that survive Edge Function restarts (decision 04/10/2026).
--
-- Written ONLY by Edge Functions with the service role (no insert/update/delete
-- policy exists for clients). Owners can read their trip's rows; kids and
-- guests see nothing. Holds counts only - never prompts, documents or outputs.
--
-- Additive, no data change. Rollback: docs/upgrade/migrations/00041_ai_usage.down.sql

create table if not exists public.ai_usage (
  member_id uuid not null references public.members(id) on delete cascade,
  fn text not null,
  day date not null,
  calls integer not null default 0 check (calls >= 0),
  updated_at timestamptz not null default now(),
  primary key (member_id, fn, day)
);

comment on table public.ai_usage is
  'Daily AI call counts per member and function (rate limits / spend cap). Service-role writes only. Migration 00041.';

alter table public.ai_usage enable row level security;

drop policy if exists ai_usage_owner_select on public.ai_usage;
create policy ai_usage_owner_select on public.ai_usage
  for select using (
    exists (
      select 1 from public.members m
      where m.id = ai_usage.member_id and public.is_owner_of(m.trip_id)
    )
  );

revoke all on public.ai_usage from anon;
