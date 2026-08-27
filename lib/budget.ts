// How the budget screen's headline "total" is decided.
//
// It used to be simply the sum of the category planned amounts. A trip can now
// carry its own overall budget, and when it does that number wins and the
// categories become allocations inside it. Both modes coexist, so the rule is
// worth stating once, in one place, rather than inline in the screen.

import type { BudgetCategory } from "@/lib/types";

export type BudgetTotals = {
  /** The headline budget: the trip's own if set, else the categories' sum. */
  planned: number;
  /** What the categories add up to, always. */
  allocated: number;
  /** Budget not yet given to any category. Zero unless a total was set by
   *  hand — otherwise the total IS the sum and nothing can be left over. */
  unallocated: number;
  /** True when the trip carries an explicit budget. */
  hasExplicitTotal: boolean;
  /** Categories promise more than the total allows. */
  overAllocated: boolean;
};

export function resolveBudgetTotals(
  totalBudget: number | null | undefined,
  categories: Pick<BudgetCategory, "planned_amount">[]
): BudgetTotals {
  const allocated = categories.reduce((sum, c) => sum + c.planned_amount, 0);
  const hasExplicitTotal = totalBudget != null;
  const planned = hasExplicitTotal ? totalBudget : allocated;
  const unallocated = hasExplicitTotal ? planned - allocated : 0;
  return {
    planned,
    allocated,
    unallocated,
    hasExplicitTotal,
    overAllocated: hasExplicitTotal && unallocated < 0,
  };
}
