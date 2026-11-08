import { describe, expect, it } from "vitest";
import { barScale, dailyAverage, familyKm, stepsOn, stepsToKm, totalBetween, weekBars } from "./stepsView";

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

  it("averages steps a day over reported non-zero days only", () => {
    const r = [
      { member_id: "a", date: "2026-11-01", steps: 10000 },
      { member_id: "a", date: "2026-11-02", steps: 0 },
      { member_id: "a", date: "2026-11-04", steps: 5001 },
      { member_id: "a", date: "2026-11-09", steps: 99999 },
    ];
    expect(dailyAverage(r, "a", "2026-11-01", "2026-11-05")).toBe(7501);
    expect(dailyAverage(r, "b", "2026-11-01", "2026-11-05")).toBeNull();
  });

  it("turns steps into km walked at 0.75 m a step", () => {
    expect(stepsToKm(10_000)).toBe(7.5);
    expect(stepsToKm(0)).toBe(0);
    expect(stepsToKm(1_234)).toBe(0.9);
  });

  it("averages family km over the parents who reported, null when none did", () => {
    const r = [
      { member_id: "a", date: "2026-11-01", steps: 10_000 },
      { member_id: "a", date: "2026-11-02", steps: 10_000 },
      { member_id: "b", date: "2026-11-02", steps: 6_000 },
      { member_id: "b", date: "2026-10-20", steps: 50_000 },
    ];
    expect(familyKm(r, ["a", "b"], "2026-10-31", "2026-11-02")).toBe(9.8); // (20000 + 6000) / 2 * 0.75 m
    expect(familyKm(r, ["a", "c"], "2026-10-31", "2026-11-02")).toBe(15); // c never reported: not counted as zero
    expect(familyKm(r, ["c"], "2026-10-31", "2026-11-02")).toBeNull();
  });
});
