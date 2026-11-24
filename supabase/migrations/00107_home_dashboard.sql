-- The parents' home in one request (perf, 24/11/2026; P1 in QA 15/11/2026).
--
-- After app_boot (00096) the home still asked about ten more questions:
-- budget categories, the trip total, every expense, today's photos, the
-- parents' names and their steps (twice, one after the other). From Vietnam
-- each one is a trip to the database's region, ~200-800 ms (edge logs,
-- 24/11/2026), and the whole set was asked again every time the home tab
-- was opened. home_dashboard(p_today, p_steps_from) answers them together.
--
-- It returns rows, not sums: the cash-withdrawal accounting (lib/budget.ts
-- countedExpenses) and the budget resolution stay in one place, in the app.
-- Expenses come with only the columns the totals need.
--
-- SECURITY INVOKER, on purpose: every read runs as the caller, under the same
-- policies as the separate queries it replaces. A kid or a guest gets what
-- their own policies return for budget, expenses and steps (nothing), exactly
-- as before - the app only calls this for a parent anyway. The parents' names
-- come from trip_member_names (00051), which the steps card already called.
--
-- Signed in only. Returns {"trip_id": null} when there is no active trip.
-- Rollback: docs/upgrade/migrations/00107_home_dashboard.down.sql.

create or replace function public.home_dashboard(p_today date, p_steps_from date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_trip_id uuid;
  v_country text;
  v_stay_from date;
  v_steps_from date;
  v_parent_ids uuid[];
begin
  select t.id into v_trip_id from trips t where t.is_active limit 1;
  if v_trip_id is null then
    return jsonb_build_object('trip_id', null);
  end if;

  -- The steps card also totals the current country stay, which can start
  -- before the week it charts: reach back to the first day of the run of
  -- days in today's country. The app checks the date this returns and asks
  -- for older rows itself if its own reckoning of the stay starts earlier.
  select d.country_code into v_country
    from itinerary_days d where d.trip_id = v_trip_id and d.date = p_today limit 1;
  if v_country is not null then
    select coalesce(
             (select max(d.date) + 1 from itinerary_days d
               where d.trip_id = v_trip_id and d.date <= p_today
                 and d.country_code is distinct from v_country),
             (select min(d.date) from itinerary_days d where d.trip_id = v_trip_id))
      into v_stay_from;
  end if;
  v_steps_from := least(p_steps_from, coalesce(v_stay_from, p_steps_from));

  select array_agg(n.id order by n.created_at) into v_parent_ids
    from public.trip_member_names(v_trip_id) n where n.role = 'owner';

  return jsonb_build_object(
    'trip_id', v_trip_id,
    'categories', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.key) from budget_categories c where c.trip_id = v_trip_id
    ), '[]'::jsonb),
    'total_budget', (select b.total_budget from trip_budget b where b.trip_id = v_trip_id),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'amount', e.amount, 'currency', e.currency, 'amount_ils', e.amount_ils,
               'spent_on', e.spent_on, 'is_cash_withdrawal', e.is_cash_withdrawal,
               'paid_in_cash', e.paid_in_cash))
        from expenses e where e.trip_id = v_trip_id
    ), '[]'::jsonb),
    -- album photos stay in their album (00087)
    'photos_today', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.created_at desc)
        from photos p where p.trip_id = v_trip_id and p.taken_on = p_today and p.album_id is null
    ), '[]'::jsonb),
    'parents', coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'name', n.display_name) order by n.created_at)
        from public.trip_member_names(v_trip_id) n where n.role = 'owner'
    ), '[]'::jsonb),
    'steps_from', v_steps_from,
    'steps', coalesce((
      select jsonb_agg(jsonb_build_object('member_id', s.member_id, 'date', s.date, 'steps', s.steps))
        from daily_steps s
       where s.member_id = any(coalesce(v_parent_ids, '{}'::uuid[]))
         and s.date >= v_steps_from and s.date <= p_today
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.home_dashboard(date, date) from public, anon;
grant execute on function public.home_dashboard(date, date) to authenticated;
