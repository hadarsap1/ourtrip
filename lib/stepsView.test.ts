import { describe, expect, it } from "vitest";
import { barScale, stepsOn, totalBetween, weekBars } from "./stepsView";

const rows = [
  { member_id: "a", date: "2026-11-10", steps: 12000 },
  { member_id: "b", date: "2026-11-10", steps: 8000 },
  { member_id: "a", date: "2026-11-08", steps: 21000 },
  { member_id: "a", date: "2026-11-01", steps: 5000 },
];

describe("steps view (Phase 2)", () => {
  it("reads one day, null when not reported", () => {
    expect(stepsOn(rows, "a", "2026-11-10")).toBe(12000);
    expect(stepsOn(rows, "b", "2026-11-09")).toBeNull();
  });

  it("builds a 7-day week ending today, zeros for gaps", () => {
    const w = weekBars(rows, ["a", "b"], "2026-11-10");
    expect(w.map((d) => d.date)).toEqual(["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10"]);
    expect(w[6].steps).toEqual({ a: 12000, b: 8000 });
    expect(w[4].steps).toEqual({ a: 21000, b: 0 });
    expect(barScale(w)).toBe(21000);
    expect(barScale(weekBars([], ["a"], "2026-11-10"))).toBe(10000);
  });

  it("totals a stay per member", () => {
    expect(totalBetween(rows, "a", "2026-11-05", "2026-11-10")).toBe(33000);
    expect(totalBetween(rows, "b", "2026-11-01", "2026-11-04")).toBe(0);
  });
});
