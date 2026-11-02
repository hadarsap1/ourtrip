-- Cash withdrawals and the big purchases paid from them (DECISIONS #52).
--
-- Hadar 02/11/2026: day-to-day spending is in cash, logged as one expense per
-- ATM withdrawal. A big purchase paid from that cash (two suitcases, ~₪1,000)
-- should be in the budget on its own, in its own category, without counting
-- the same money twice.
--
-- An expense can now be a cash withdrawal (`is_cash_withdrawal`), and another
-- expense can say it was paid from one (`paid_from_expense_id`). The amounts
-- stay as entered; the client counts a withdrawal as what is left of it once
-- the purchases paid from it are taken out, never below zero
-- (lib/budget.ts countedExpenses). Deleting a withdrawal leaves its purchases
-- as ordinary expenses (on delete set null).
--
-- RLS coverage: no new policy. Both columns are on `expenses`, covered by
-- expenses_owner_all (00001): owners only, kids and guests read and write
-- nothing. The guard below runs as the caller (security invoker), so its
-- lookup of the withdrawal is itself under that policy and reveals nothing.

alter table public.expenses
  add column if not exists is_cash_withdrawal boolean not null default false,
  add column if not exists paid_from_expense_id uuid
    references public.expenses(id) on delete set null;

-- a withdrawal is not itself paid from another one, and nothing is paid from itself
alter table public.expenses
  add constraint expenses_withdrawal_not_paid_from
    check (not (is_cash_withdrawal and paid_from_expense_id is not null)),
  add constraint expenses_not_paid_from_self
    check (paid_from_expense_id is distinct from id);

create index if not exists idx_expenses_paid_from_expense_id
  on public.expenses(paid_from_expense_id)
  where paid_from_expense_id is not null;

-- The link must point at a withdrawal of the same trip, and a withdrawal that
-- still has purchases paid from it cannot stop being one (they would silently
-- start counting twice).
create or replace function public.expenses_cash_guard()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.paid_from_expense_id is not null and not exists (
    select 1 from public.expenses w
    where w.id = new.paid_from_expense_id
      and w.trip_id = new.trip_id
      and w.is_cash_withdrawal
  ) then
    raise exception 'paid_from_expense_id must be a cash withdrawal of the same trip'
      using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and old.is_cash_withdrawal and not new.is_cash_withdrawal
     and exists (select 1 from public.expenses c where c.paid_from_expense_id = new.id) then
    raise exception 'cash withdrawal still has expenses paid from it'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

revoke execute on function public.expenses_cash_guard() from public, anon, authenticated;

drop trigger if exists expenses_cash_guard on public.expenses;
create trigger expenses_cash_guard
  before insert or update of paid_from_expense_id, is_cash_withdrawal, trip_id
  on public.expenses
  for each row execute function public.expenses_cash_guard();
