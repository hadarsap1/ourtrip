import { describe, expect, it } from "vitest";
import {
  resolveBudgetTotals,
  resolveBudgetProgress,
  resolveBudgetPace,
} from "./budget";
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

// The two screens disagreed about what "budget" meant: the budget screen's bar
// was spending (1% full) while the home screen's was allocation (91% full).
// These pin down the one definition both now use.
describe("resolveBudgetProgress", () => {
  const totals = resolveBudgetTotals(170000, [
    { planned_amount: 155377 },
  ]);

  it("measures spending against the budget, not allocation", () => {
    const p = resolveBudgetProgress(totals, 1120);
    expect(p.usedPct).toBe(1);
    expect(p.remaining).toBe(168880);
    expect(p.overSpent).toBe(false);
  });

  it("does not let the allocated sum move the spending figures", () => {
    // ₪155,377 is promised to categories; none of it is spent.
    const promised = resolveBudgetProgress(totals, 0);
    expect(promised.usedPct).toBe(0);
    expect(promised.remaining).toBe(170000);
  });

  it("goes negative once the budget is exceeded", () => {
    const p = resolveBudgetProgress(totals, 175000);
    expect(p.overSpent).toBe(true);
    expect(p.remaining).toBe(-5000);
  });

  it("measures against the planned sum when no target is declared", () => {
    const noTarget = resolveBudgetTotals(null, [{ planned_amount: 50000 }]);
    expect(resolveBudgetProgress(noTarget, 25000).usedPct).toBe(50);
  });

  it("reports nothing used when there is no budget at all", () => {
    const nothing = resolveBudgetTotals(null, []);
    expect(resolveBudgetProgress(nothing, 0).usedPct).toBe(0);
  });
});

describe("resolveBudgetPace", () => {
  const START = "2026-10-31";
  const END = "2027-06-17"; // 230 days
  const e = (amount_ils: number, spent_on: string, created_at?: string) => ({
    amount_ils,
    spent_on,
    created_at,
  });

  it("keeps a booking paid in advance but dated inside the trip out of the pace", () => {
    // The real case: a Chiang Mai hotel paid in September, dated 22/11. On the
    // morning of day 3 it must not count as three days of spending.
    const pace = resolveBudgetPace(
      [
        e(1864, "2026-11-22", "2026-09-22T08:42:16Z"),
        e(1950, "2026-10-31", "2026-09-14T16:34:43Z"),
        e(50, "2026-11-02", "2026-11-02T12:00:00Z"),
      ],
      START,
      END,
      "2026-11-02"
    );
    expect(pace.prepaid).toBe(3814);
    expect(pace.onTrip).toBe(50);
    expect(pace.burnPerDay).toBeCloseTo(50 / 3);
    // prepaid once, plus the real pace over the 227 days left
    expect(pace.projection).toBeCloseTo(3864 + (50 / 3) * 227);
  });

  it("does not count an expense dated in the future, even one entered on the trip", () => {
    const pace = resolveBudgetPace(
      [e(900, "2026-11-20", "2026-11-02T10:00:00Z")],
      START,
      END,
      "2026-11-02"
    );
    expect(pace.onTrip).toBe(0);
    expect(pace.prepaid).toBe(900);
  });

  it("starts counting a future-dated expense once its day arrives", () => {
    const pace = resolveBudgetPace(
      [e(900, "2026-11-20", "2026-11-02T10:00:00Z")],
      START,
      END,
      "2026-11-20"
    );
    expect(pace.onTrip).toBe(900);
  });

  it("before departure has no pace and projects what is already spent", () => {
    const pace = resolveBudgetPace([e(624, "2026-08-10")], START, END, "2026-09-24");
    expect(pace.notStarted).toBe(true);
    expect(pace.burnPerDay).toBeNull();
    expect(pace.projection).toBe(624);
    expect(pace.prepaid).toBe(624);
  });

  it("treats rows without created_at by their date alone", () => {
    const pace = resolveBudgetPace([e(100, "2026-11-01")], START, END, "2026-11-02");
    expect(pace.onTrip).toBe(100);
    expect(pace.burnPerDay).toBeCloseTo(100 / 3); // day 3 of the trip
  });

  it("has no pace without trip dates", () => {
    const pace = resolveBudgetPace([e(100, "2026-11-01")], null, null, "2026-11-02");
    expect(pace.burnPerDay).toBeNull();
    expect(pace.projection).toBeNull();
  });
});
