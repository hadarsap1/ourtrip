import { describe, expect, it } from "vitest";
import { todayAllowance } from "./todayBudget";

describe("todayAllowance (1.6)", () => {
  it("in trip: spreads what was left this morning over the days still to go", () => {
    // 10 days left including today, 6000 left now after spending 200 today
    const r = todayAllowance({ remaining: 6000, spentToday: 200, today: "2027-06-08", start: "2026-10-31", end: "2027-06-17" })!;
    expect(r.daysLeft).toBe(10);
    expect(r.dailyShare).toBe(620);
    expect(r.leftToday).toBe(420);
  });

  it("pre-trip: the daily share of the whole trip, today's pre-trip spend not counted", () => {
    const r = todayAllowance({ remaining: 230_000, spentToday: 500, today: "2026-10-04", start: "2026-10-31", end: "2027-06-17" })!;
    expect(r.daysLeft).toBe(230);
    expect(r.dailyShare).toBe(1000);
    expect(r.leftToday).toBe(1000);
  });

  it("can go negative when today overspends, and is null after the trip", () => {
    expect(todayAllowance({ remaining: 0, spentToday: 900, today: "2027-06-17", start: "2026-10-31", end: "2027-06-17" })!.leftToday).toBe(0);
    expect(todayAllowance({ remaining: -100, spentToday: 900, today: "2027-06-17", start: "2026-10-31", end: "2027-06-17" })!.leftToday).toBe(-100);
    expect(todayAllowance({ remaining: 5, spentToday: 0, today: "2027-07-01", start: "2026-10-31", end: "2027-06-17" })).toBeNull();
  });
});
