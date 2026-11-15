-- Cash is one wallet per currency, not one pot per withdrawal (DECISIONS #60,
-- amends #52).
--
-- Hadar 14/11/2026: every cash expense should be logged, and marking one as
-- paid in cash should not mean picking a withdrawal - what matters is how much
-- cash is left in total. Cash is in the local currency, so a new country is a
-- new wallet.
--
-- An expense is now just "paid in cash" (`paid_in_cash`). The client keeps one
-- wallet per currency: the withdrawals in that currency minus the cash
-- expenses in it, shown never below zero. For the totals, the cash expenses
-- use up the withdrawals of their currency oldest first, and a withdrawal
-- counts only what is left of it (lib/budget.ts countedExpenses), so no money
-- is counted twice.
--
-- Existing links (`paid_from_expense_id`) become `paid_in_cash` and the link
-- is cleared. The column stays for a while so an app still cached on a phone,
-- or an entry still in its offline queue, that sends a link keeps working:
-- the guard turns it into `paid_in_cash` on the way in.
--
-- RLS coverage: no new policy. The column is on `expenses`, covered by
-- expenses_owner_all (00001, read once per query since 00086): owners only,
-- kids and guests read and write nothing. The guard runs as the caller
-- (security invoker) and looks nothing up.

alter table public.expenses
  add column if not exists paid_in_cash boolean not null default false;

-- the old guard checks the link; replace it before touching the rows
create or replace function public.expenses_cash_guard()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  -- an older client still links to a withdrawal: that means "paid in cash"
  if new.paid_from_expense_id is not null then
    new.paid_in_cash := not new.is_cash_withdrawal;
    new.paid_from_expense_id := null;
  end if;
  return new;
end $$;

revoke execute on function public.expenses_cash_guard() from public, anon, authenticated;

drop trigger if exists expenses_cash_guard on public.expenses;
create trigger expenses_cash_guard
  before insert or update of paid_from_expense_id
  on public.expenses
  for each row execute function public.expenses_cash_guard();

update public.expenses
  set paid_in_cash = true, paid_from_expense_id = null
  where paid_from_expense_id is not null;

-- a withdrawal is the cash itself, not something paid with it
alter table public.expenses
  drop constraint if exists expenses_withdrawal_not_paid_in_cash;
alter table public.expenses
  add constraint expenses_withdrawal_not_paid_in_cash
    check (not (is_cash_withdrawal and paid_in_cash));
