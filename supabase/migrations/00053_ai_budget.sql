-- A monthly AI spend cap for the trip (Hadar 14/10/2026: "so I don't get an
-- inflated bill by mistake").
--
-- Every Edge Function that calls the Claude API now goes through two steps:
--
--   ai_reserve(fn, daily_cap)   BEFORE the model call, as the calling parent.
--                               Refuses when this month's estimated spend has
--                               reached the trip's budget, or when the trip
--                               already made daily_cap calls to this function
--                               today; otherwise counts the call. Serialized
--                               per trip (row lock), so two taps can't both
--                               slip under the cap.
--   ai_record(member, fn, ...)  AFTER the call, service role only: adds the
--                               call's real token counts and estimated cost.
--
-- The budget defaults to $10 a month and a parent can change it (0-200) from
-- the settings screen. It lives in its own owner-only table, so kids and
-- guests can't read it (hard rule 2), unlike a column on trips.
--
-- Cost is an ESTIMATE from token counts x list price (_shared/aiCost.ts); the
-- real bill is Anthropic's. One call can overshoot the cap by its own cost,
-- since the cost is known only after it returns.

-- ============ budget ============

create table public.trip_ai_settings (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  monthly_budget_usd numeric(8,2) not null default 10
    check (monthly_budget_usd >= 0 and monthly_budget_usd <= 200),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.members(id) on delete set null
);

comment on table public.trip_ai_settings is
  'Monthly AI spend cap per trip, USD. Owners only. Migration 00053.';

create index idx_trip_ai_settings_updated_by on public.trip_ai_settings(updated_by);

alter table public.trip_ai_settings enable row level security;

create policy trip_ai_settings_owner_select on public.trip_ai_settings
  for select using (public.is_owner_of(trip_id));
create policy trip_ai_settings_owner_insert on public.trip_ai_settings
  for insert with check (public.is_owner_of(trip_id));
create policy trip_ai_settings_owner_update on public.trip_ai_settings
  for update using (public.is_owner_of(trip_id)) with check (public.is_owner_of(trip_id));

revoke all on public.trip_ai_settings from anon;

create or replace function public.trip_ai_settings_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := public.current_member_id();
  return new;
end;
$$;
revoke execute on function public.trip_ai_settings_stamp() from public, anon, authenticated;

create trigger trip_ai_settings_stamp
  before insert or update on public.trip_ai_settings
  for each row execute function public.trip_ai_settings_stamp();

-- ============ usage: tokens and cost ============

alter table public.ai_usage
  add column input_tokens bigint not null default 0 check (input_tokens >= 0),
  add column output_tokens bigint not null default 0 check (output_tokens >= 0),
  add column cost_usd numeric(12,6) not null default 0 check (cost_usd >= 0);

-- ============ reserve (before the call) ============

create or replace function public.ai_reserve(p_fn text, p_daily_cap integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_member uuid := public.current_member_id();
  v_trip uuid;
  v_today date := (now() at time zone 'utc')::date;
  v_month date := date_trunc('month', now() at time zone 'utc')::date;
  v_budget numeric;
  v_spent numeric;
  v_calls integer;
begin
  if v_member is null or public.current_member_role() is distinct from 'owner' then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if p_fn is null or p_fn !~ '^[a-z-]{1,40}$' or p_daily_cap is null or p_daily_cap < 1 then
    raise exception 'ai_reserve: bad arguments';
  end if;

  select trip_id into v_trip from members where id = v_member;
  -- one reservation at a time per trip
  perform 1 from trips where id = v_trip for update;

  select coalesce((select monthly_budget_usd from trip_ai_settings where trip_id = v_trip), 10)
    into v_budget;
  select coalesce(sum(u.cost_usd), 0) into v_spent
    from ai_usage u join members m on m.id = u.member_id
   where m.trip_id = v_trip and u.day >= v_month;
  if v_spent >= v_budget then
    return jsonb_build_object('ok', false, 'reason', 'ai_budget');
  end if;

  select coalesce(sum(u.calls), 0) into v_calls
    from ai_usage u join members m on m.id = u.member_id
   where m.trip_id = v_trip and u.fn = p_fn and u.day = v_today;
  if v_calls >= p_daily_cap then
    return jsonb_build_object('ok', false, 'reason', 'ai_daily_limit');
  end if;

  -- counted before the call: a call that times out may still be billed
  insert into ai_usage (member_id, fn, day, calls) values (v_member, p_fn, v_today, 1)
  on conflict (member_id, fn, day)
  do update set calls = ai_usage.calls + 1, updated_at = now();

  return jsonb_build_object('ok', true, 'member_id', v_member,
                            'calls_left_today', p_daily_cap - v_calls - 1);
end;
$$;

revoke execute on function public.ai_reserve(text, integer) from public, anon;
grant execute on function public.ai_reserve(text, integer) to authenticated;

-- ============ record (after the call) ============

create or replace function public.ai_record(
  p_member_id uuid, p_fn text, p_input_tokens bigint, p_output_tokens bigint, p_cost_usd numeric
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'utc')::date;
begin
  insert into ai_usage (member_id, fn, day, calls, input_tokens, output_tokens, cost_usd)
  values (p_member_id, p_fn, v_today, 0,
          greatest(coalesce(p_input_tokens, 0), 0),
          greatest(coalesce(p_output_tokens, 0), 0),
          greatest(coalesce(p_cost_usd, 0), 0))
  on conflict (member_id, fn, day) do update set
    input_tokens = ai_usage.input_tokens + excluded.input_tokens,
    output_tokens = ai_usage.output_tokens + excluded.output_tokens,
    cost_usd = ai_usage.cost_usd + excluded.cost_usd,
    updated_at = now();
end;
$$;

revoke execute on function public.ai_record(uuid, text, bigint, bigint, numeric) from public, anon, authenticated;
grant execute on function public.ai_record(uuid, text, bigint, bigint, numeric) to service_role;
