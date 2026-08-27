import { describe, expect, it } from "vitest";
import { resolveBudgetTotals } from "./budget";
import type { BudgetCategory } from "@/lib/types";

const cat = (planned_amount: number) =>
  ({ planned_amount }) as Pick<BudgetCategory, "planned_amount">;

describe("resolveBudgetTotals", () => {
  const categories = [cat(10000), cat(5000), cat(2500)];

  it("always reports planned as the sum of the categories", () => {
    // The whole point of the split: planned tracks the categories, so editing
    // one moves the headline figure immediately.
    expect(resolveBudgetTotals(null, categories).planned).toBe(17500);
    expect(resolveBudgetTotals(60000, categories).planned).toBe(17500);
  });

  it("keeps planned in step when a category changes, target or not", () => {
    const raised = [cat(10000), cat(9000), cat(2500)];
    expect(resolveBudgetTotals(60000, raised).planned).toBe(21500);
    expect(resolveBudgetTotals(60000, raised).gap).toBe(38500);
  });

  it("reports the gap to the target", () => {
    const t = resolveBudgetTotals(60000, categories);
    expect(t.target).toBe(60000);
    expect(t.hasTarget).toBe(true);
    expect(t.gap).toBe(42500);
    expect(t.overTarget).toBe(false);
  });

  it("flags categories promising more than the target allows", () => {
    const t = resolveBudgetTotals(10000, categories);
    expect(t.gap).toBe(-7500);
    expect(t.overTarget).toBe(true);
  });

  it("has no gap at all when no target is set", () => {
    // Without a declared budget there is nothing to be short of, so a non-zero
    // gap here would be meaningless rather than merely wrong.
    const t = resolveBudgetTotals(null, categories);
    expect(t.hasTarget).toBe(false);
    expect(t.target).toBeNull();
    expect(t.gap).toBe(0);
    expect(t.overTarget).toBe(false);
  });

  it("treats a target of 0 as declared, not absent", () => {
    // 0 is falsy; `||` here instead of `??` would silently drop the target and
    // show a budget nobody chose.
    const t = resolveBudgetTotals(0, categories);
    expect(t.hasTarget).toBe(true);
    expect(t.target).toBe(0);
    expect(t.gap).toBe(-17500);
    expect(t.overTarget).toBe(true);
  });

  it("measures spending against the target when there is one", () => {
    expect(resolveBudgetTotals(60000, categories).budgetForProgress).toBe(60000);
  });

  it("falls back to the planned sum for the progress bar", () => {
    // Otherwise a trip with no declared target would have nothing to measure
    // spending against and the bar would always read zero.
    expect(resolveBudgetTotals(null, categories).budgetForProgress).toBe(17500);
  });

  it("handles a trip with no categories at all", () => {
    expect(resolveBudgetTotals(null, [])).toMatchObject({
      planned: 0,
      target: null,
      gap: 0,
      budgetForProgress: 0,
    });
    expect(resolveBudgetTotals(5000, [])).toMatchObject({
      planned: 0,
      gap: 5000,
      overTarget: false,
      budgetForProgress: 5000,
    });
  });
});
