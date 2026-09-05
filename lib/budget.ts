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

import type { BudgetCategory } from "@/lib/types";

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
