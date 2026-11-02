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
 * Cash withdrawals (00082, DECISIONS #52).
 *
 * Day-to-day cash is logged as one expense per ATM withdrawal. A big purchase
 * paid from that cash is logged on its own, in its own category, pointing at
 * the withdrawal. Counting both as entered would count that money twice, so a
 * withdrawal counts only what is left of it once its purchases are taken out
 * - never below zero: purchases beyond the withdrawal came from other cash and
 * still count in full.
 *
 * Every total, per-day and per-category sum runs on these counted amounts; the
 * expense list keeps showing what was entered.
 */
type CashFields = Pick<Expense, "id" | "amount_ils" | "is_cash_withdrawal" | "paid_from_expense_id">;

export type CashWithdrawalSplit = {
  /** What was withdrawn, in ILS. */
  withdrawn: number;
  /** Sum of the purchases logged as paid from it. */
  itemized: number;
  /** What it still counts as: withdrawn − itemized, at least 0. */
  left: number;
  /** Number of purchases paid from it. */
  count: number;
};

export function cashWithdrawalSplits(expenses: CashFields[]): Map<string, CashWithdrawalSplit> {
  const splits = new Map<string, CashWithdrawalSplit>();
  for (const e of expenses) {
    if (e.is_cash_withdrawal) {
      splits.set(e.id, { withdrawn: e.amount_ils, itemized: 0, left: e.amount_ils, count: 0 });
    }
  }
  for (const e of expenses) {
    const split = e.paid_from_expense_id ? splits.get(e.paid_from_expense_id) : undefined;
    if (!split) continue;
    split.itemized += e.amount_ils;
    split.count += 1;
  }
  for (const split of splits.values()) {
    split.left = Math.max(0, Math.round((split.withdrawn - split.itemized) * 100) / 100);
  }
  return splits;
}

/** The expenses with each withdrawal's amount_ils replaced by what it still
 *  counts as. Feed this, not the raw list, to any sum. */
export function countedExpenses<T extends CashFields>(expenses: T[]): T[] {
  const splits = cashWithdrawalSplits(expenses);
  if (splits.size === 0) return expenses;
  return expenses.map((e) => {
    const split = splits.get(e.id);
    return split ? { ...e, amount_ils: split.left } : e;
  });
}
