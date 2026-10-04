-- Phase 2: Steps counter (decision 04/10/2026). Parents only.
--
-- daily_steps: one row per parent per day, upserted by the steps-ingest Edge
--   Function from an Apple Shortcuts automation (iPhone Health → POST).
-- step_tokens: one revocable secret per iPhone. Only a SHA-256 hash is stored;
--   the phone holds the token, never a Supabase key.
--
-- RLS: owners of the member's trip read and write both tables; kids and guests
-- have no policy, so no access. The Edge Function writes with the service role.
--
-- Additive, no data change. Rollback: docs/upgrade/migrations/00042_steps.down.sql

create table if not exists public.daily_steps (
  member_id uuid not null references public.members(id) on delete cascade,
  date date not null,
  steps integer not null check (steps between 0 and 200000),
  updated_at timestamptz not null default now(),
  primary key (member_id, date)
);

create table if not exists public.step_tokens (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  label text check (char_length(label) <= 40),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists idx_step_tokens_member on public.step_tokens(member_id);

comment on table public.daily_steps is 'Daily step count per parent (Apple Health via Shortcuts → steps-ingest). Owners only. Migration 00042.';
comment on table public.step_tokens is 'Per-iPhone ingest token, SHA-256 hash only. Owners only. Migration 00042.';

alter table public.daily_steps enable row level security;
alter table public.step_tokens enable row level security;

-- daily_steps: both parents see and may correct both parents' steps.
drop policy if exists daily_steps_owner_all on public.daily_steps;
create policy daily_steps_owner_all on public.daily_steps
  for all
  using (exists (select 1 from public.members m where m.id = daily_steps.member_id and public.is_owner_of(m.trip_id)))
  with check (exists (select 1 from public.members m where m.id = daily_steps.member_id and public.is_owner_of(m.trip_id)));

-- step_tokens: owners see their trip's tokens (label, last used) and can revoke
-- any of them (a lost phone); a parent creates tokens only for themself.
drop policy if exists step_tokens_owner_select on public.step_tokens;
create policy step_tokens_owner_select on public.step_tokens
  for select using (exists (select 1 from public.members m where m.id = step_tokens.member_id and public.is_owner_of(m.trip_id)));

drop policy if exists step_tokens_self_insert on public.step_tokens;
create policy step_tokens_self_insert on public.step_tokens
  for insert with check (member_id = public.current_member_id() and public.current_member_role() = 'owner');

drop policy if exists step_tokens_owner_update on public.step_tokens;
create policy step_tokens_owner_update on public.step_tokens
  for update
  using (exists (select 1 from public.members m where m.id = step_tokens.member_id and public.is_owner_of(m.trip_id)))
  with check (exists (select 1 from public.members m where m.id = step_tokens.member_id and public.is_owner_of(m.trip_id)));

drop policy if exists step_tokens_owner_delete on public.step_tokens;
create policy step_tokens_owner_delete on public.step_tokens
  for delete using (exists (select 1 from public.members m where m.id = step_tokens.member_id and public.is_owner_of(m.trip_id)));

revoke all on public.daily_steps from anon;
revoke all on public.step_tokens from anon;
