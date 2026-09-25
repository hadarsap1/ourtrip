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

/**
 * Daily burn and end-of-trip projection.
 *
 * WHY "PREPAID" AND NOT JUST "BEFORE THE TRIP". Splitting by `spent_on` alone
 * let money paid in advance leak into the daily pace. A booking's expense is
 * dated on the day the stay starts, so a hotel paid for in September and dated
 * 22/11 counted as on-trip spending, and every prepaid flight or hotel dated
 * inside the trip did the same. On the first morning the pace divided
 * thousands of shekels of bookings by one day, and the projection multiplied
 * that by the 229 days still to go: millions, on a ₪180,000 budget.
 *
 * So an expense counts toward the pace only when it was spent on a trip day
 * that has already happened AND was recorded once the trip was under way.
 * Everything else (before departure, dated in the future, or entered before
 * the trip started whatever its date) is prepaid: part of the totals, added
 * once to the projection, never averaged into a day.
 */
export type PaceExpense = {
  amount_ils: number;
  spent_on: string;
  created_at?: string | null;
};

export type BudgetPace = {
  /** Money paid in advance: counted once, excluded from the daily pace. */
  prepaid: number;
  /** Spent on trip days so far, the basis of the pace. */
  onTrip: number;
  /** Average per elapsed trip day, or null before the trip starts. */
  burnPerDay: number | null;
  /** Spent so far plus the pace over the days left. */
  projection: number | null;
  notStarted: boolean;
};

function daysBetween(fromISO: string, toISO: string): number {
  return Math.round(
    (Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) /
      86_400_000
  );
}

export function resolveBudgetPace(
  expenses: PaceExpense[],
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  today: string
): BudgetPace {
  const spent = expenses.reduce((sum, e) => sum + e.amount_ils, 0);
  if (!startDate || !endDate) {
    return { prepaid: 0, onTrip: spent, burnPerDay: null, projection: null, notStarted: false };
  }

  const isPace = (e: PaceExpense) =>
    e.spent_on >= startDate &&
    e.spent_on <= today &&
    (!e.created_at || e.created_at.slice(0, 10) >= startDate);
  const onTrip = expenses.filter(isPace).reduce((sum, e) => sum + e.amount_ils, 0);
  const prepaid = spent - onTrip;

  if (today < startDate) {
    return { prepaid, onTrip, burnPerDay: null, projection: spent, notStarted: true };
  }
  const totalDays = daysBetween(startDate, endDate) + 1;
  const elapsed = Math.min(daysBetween(startDate, today) + 1, totalDays);
  const remaining = Math.max(totalDays - elapsed, 0);
  const burnPerDay = onTrip / elapsed;
  return {
    prepaid,
    onTrip,
    burnPerDay,
    projection: spent + burnPerDay * remaining,
    notStarted: false,
  };
}
