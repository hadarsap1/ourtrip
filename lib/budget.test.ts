import { describe, expect, it } from "vitest";
import { resolveBudgetTotals } from "./budget";
import type { BudgetCategory } from "@/lib/types";

const cat = (planned_amount: number) =>
  ({ planned_amount }) as Pick<BudgetCategory, "planned_amount">;

describe("resolveBudgetTotals", () => {
  const categories = [cat(10000), cat(5000), cat(2500)];

  it("falls back to the sum of the categories when no total is set", () => {
    // The historical behaviour, and still what happens for anyone who never
    // sets an overall budget.
    const t = resolveBudgetTotals(null, categories);
    expect(t.planned).toBe(17500);
    expect(t.allocated).toBe(17500);
    expect(t.hasExplicitTotal).toBe(false);
  });

  it("never reports leftover budget in derived mode", () => {
    // The total IS the sum there, so "unallocated" could only ever be 0 —
    // showing anything else would be nonsense.
    expect(resolveBudgetTotals(null, categories).unallocated).toBe(0);
    expect(resolveBudgetTotals(undefined, categories).unallocated).toBe(0);
  });

  it("lets an explicit total win over the categories", () => {
    const t = resolveBudgetTotals(60000, categories);
    expect(t.planned).toBe(60000);
    expect(t.allocated).toBe(17500);
    expect(t.unallocated).toBe(42500);
    expect(t.hasExplicitTotal).toBe(true);
    expect(t.overAllocated).toBe(false);
  });

  it("flags categories promising more than the total allows", () => {
    const t = resolveBudgetTotals(10000, categories);
    expect(t.unallocated).toBe(-7500);
    expect(t.overAllocated).toBe(true);
  });

  it("treats a zero total as set, not as absent", () => {
    // 0 is falsy; using `||` here instead of `??` would silently fall back to
    // the category sum and show a budget the owner did not set.
    const t = resolveBudgetTotals(0, categories);
    expect(t.planned).toBe(0);
    expect(t.hasExplicitTotal).toBe(true);
    expect(t.overAllocated).toBe(true);
  });

  it("handles a trip with no categories at all", () => {
    expect(resolveBudgetTotals(null, [])).toMatchObject({
      planned: 0,
      allocated: 0,
      unallocated: 0,
      hasExplicitTotal: false,
    });
    expect(resolveBudgetTotals(5000, [])).toMatchObject({
      planned: 5000,
      unallocated: 5000,
      overAllocated: false,
    });
  });
});
