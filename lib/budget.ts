// How the budget screen reconciles two numbers that are about the same money.
//
// PLANNED is what the categories add up to. It is the headline figure, and it
// moves the moment a category's planned amount changes - that immediacy is the
// point: a total that sat still while you edited a category read as though
// nothing had happened, and the two numbers drifted apart with no visible
// relationship between them.
//
// TARGET is the trip's own overall budget (trips.total_budget), set by hand and
// optional. It does not move on its own. It answers "how much do we actually
// have", against which the planned figure is measured.
//
// So they are never in competition: planned is derived and always in sync,
// target is declared, and the gap between them is the thing worth looking at.

import type { BudgetCategory, Expense } from "@/lib/types";

export type BudgetTotals = {
  /** Sum of the category planned amounts. Always in sync with them. */
  planned: number;
  /** The trip's declared overall budget, or null when none is set. */
  target: number | null;
  /** True when a target has been declared. */
  hasTarget: boolean;
  /** target − planned. Positive = budget not yet given to a category.
   *  Negative = the categories promise more than the target allows.
   *  Zero when there is no target: without one there is nothing to be short of. */
  gap: number;
  /** Categories promise more than the target allows. */
  overTarget: boolean;
  /** What spending is measured against: the target when declared, otherwise
   *  the planned sum. Keeps the progress bar meaningful in both modes. */
  budgetForProgress: number;
};

export function resolveBudgetTotals(
  totalBudget: number | null | undefined,
  categories: Pick<BudgetCategory, "planned_amount">[]
): BudgetTotals {
  const planned = categories.reduce((sum, c) => sum + c.planned_amount, 0);
  const hasTarget = totalBudget != null;
  const target = hasTarget ? totalBudget : null;
  const gap = hasTarget ? target! - planned : 0;
  return {
    planned,
    target,
    hasTarget,
    gap,
    overTarget: hasTarget && gap < 0,
    budgetForProgress: hasTarget ? target! : planned,
  };
}

/**
 * How much of the budget is actually gone.
 *
 * WHY THIS IS SHARED. The budget screen and the home screen both draw a bar
 * labelled "budget", and they disagreed: the budget screen's bar was spending
 * against the budget (1% full) while the home screen's was allocation against
 * the target (91% full). Same title, same shape, opposite meanings - the home
 * screen read as "you have spent 91%" when ₪1,120 of ₪170,000 was gone.
 *
 * Spending and allocation are both worth showing, but only one of them is a
 * bar, and it is this one. Allocation stays as text (`gap` on BudgetTotals).
 */
export type BudgetProgress = {
  spent: number;
  /** What is left to spend. Negative once the budget is exceeded. */
  remaining: number;
  /** Share of the budget already spent, 0-100 and clamped for the bar. */
  usedPct: number;
  overSpent: boolean;
};

export function resolveBudgetProgress(
  totals: Pick<BudgetTotals, "budgetForProgress">,
  spent: number
): BudgetProgress {
  const { budgetForProgress } = totals;
  const remaining = budgetForProgress - spent;
  const usedPct =
    budgetForProgress > 0
      ? Math.round((spent / budgetForProgress) * 100)
      : 0;
  return { spent, remaining, usedPct, overSpent: remaining < 0 };
}

/**
 * Cash: one wallet per currency (00089, DECISIONS #60, amends #52).
 *
 * Cash is drawn at an ATM in the local currency and logged as a withdrawal.
 * Every expense paid with that cash is logged on its own, in its own category,
 * marked "paid in cash" - no link to any particular withdrawal. A new country
 * is a new currency, so a new wallet.
 *
 * - The wallet of a currency: its withdrawals minus its cash expenses, in that
 *   currency, shown never below zero.
 * - So no money is counted twice, the cash expenses use up the withdrawals of
 *   their currency oldest first, and a withdrawal counts in the totals only
 *   what is left of it (in ILS at its own rate) - never below zero: cash
 *   spent beyond the withdrawals still counts in full.
 *
 * Every total, per-day and per-category sum runs on these counted amounts; the
 * expense list keeps showing what was entered.
 */
type CashFields = Pick<
  Expense,
  "id" | "amount" | "currency" | "amount_ils" | "spent_on" | "is_cash_withdrawal" | "paid_in_cash"
>;

export type CashWallet = {
  currency: string;
  /** Withdrawn in this currency. */
  withdrawn: number;
  /** Logged as paid in cash in this currency. */
  spent: number;
  /** withdrawn − spent, at least 0. */
  left: number;
  withdrawals: number;
  /** The newest withdrawal's date, to put the current wallet first. */
  lastWithdrawal: string;
};

export type CashWithdrawalUse = {
  /** In the withdrawal's own currency. */
  withdrawn: number;
  used: number;
  left: number;
  /** What it still counts as in the totals, in ILS. */
  countedIls: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const byDate = (a: CashFields, b: CashFields) =>
  a.spent_on < b.spent_on ? -1 : a.spent_on > b.spent_on ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

function allocateCash(expenses: CashFields[]) {
  const spentBy = new Map<string, number>();
  const withdrawalsBy = new Map<string, CashFields[]>();
  for (const e of expenses) {
    if (e.is_cash_withdrawal) {
      withdrawalsBy.set(e.currency, [...(withdrawalsBy.get(e.currency) ?? []), e]);
    } else if (e.paid_in_cash) {
      spentBy.set(e.currency, (spentBy.get(e.currency) ?? 0) + e.amount);
    }
  }
  const wallets: CashWallet[] = [];
  const uses = new Map<string, CashWithdrawalUse>();
  for (const [currency, list] of withdrawalsBy) {
    const spent = round2(spentBy.get(currency) ?? 0);
    let toCover = spent;
    let withdrawn = 0;
    for (const w of [...list].sort(byDate)) {
      withdrawn += w.amount;
      const used = round2(Math.min(w.amount, Math.max(0, toCover)));
      toCover -= used;
      const left = round2(w.amount - used);
      uses.set(w.id, {
        withdrawn: w.amount,
        used,
        left,
        countedIls: w.amount > 0 ? round2((w.amount_ils * left) / w.amount) : 0,
      });
    }
    withdrawn = round2(withdrawn);
    wallets.push({
      currency,
      withdrawn,
      spent,
      left: Math.max(0, round2(withdrawn - spent)),
      withdrawals: list.length,
      lastWithdrawal: list.reduce((d, w) => (w.spent_on > d ? w.spent_on : d), ""),
    });
  }
  wallets.sort((a, b) => (a.lastWithdrawal < b.lastWithdrawal ? 1 : a.lastWithdrawal > b.lastWithdrawal ? -1 : 0));
  return { wallets, uses };
}

/** The cash wallets, newest withdrawal first (one per currency withdrawn). */
export function cashWallets(expenses: CashFields[]): CashWallet[] {
  return allocateCash(expenses).wallets;
}

/** How much of each withdrawal the cash expenses used up, oldest first. */
export function cashWithdrawalUses(expenses: CashFields[]): Map<string, CashWithdrawalUse> {
  return allocateCash(expenses).uses;
}

/** The expenses with each withdrawal's amount_ils replaced by what it still
 *  counts as. Feed this, not the raw list, to any sum. */
export function countedExpenses<T extends CashFields>(expenses: T[]): T[] {
  if (!expenses.some((e) => e.is_cash_withdrawal)) return expenses;
  const uses = cashWithdrawalUses(expenses);
  return expenses.map((e) => {
    const use = uses.get(e.id);
    return use ? { ...e, amount_ils: use.countedIls } : e;
  });
}
