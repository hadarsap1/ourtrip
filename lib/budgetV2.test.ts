import { describe, expect, it } from "vitest";
import { countryVisits, dailySpend, finishedVisitSummaries, sparkPoints, spendByCountry } from "./budgetV2";

const day = (date: string, country_code: string | null) => ({ date, country_code });
const exp = (spent_on: string, amount_ils: number, category_id = "food") => ({ spent_on, amount_ils, category_id });

const days = [
  day("2026-10-31", "VN"), day("2026-11-01", "VN"), day("2026-11-02", "VN"),
  day("2026-11-03", "TH"), day("2026-11-04", "TH"),
  day("2026-11-05", "VN"), day("2026-11-06", "VN"),
];

describe("budget v2 (Phase 2.4)", () => {
  it("sums spending per day for the window, oldest first", () => {
    const s = dailySpend([exp("2026-11-01", 100), exp("2026-11-01", 50), exp("2026-11-03", 20), exp("2026-10-01", 999)], "2026-11-03", 3);
    expect(s).toEqual([150, 0, 20]);
  });

  it("groups consecutive days into country visits", () => {
    expect(countryVisits(days)).toEqual([
      { code: "VN", from: "2026-10-31", to: "2026-11-02" },
      { code: "TH", from: "2026-11-03", to: "2026-11-04" },
      { code: "VN", from: "2026-11-05", to: "2026-11-06" },
    ]);
  });

  it("assigns spending to the country of that day, pre-trip to unassigned", () => {
    const r = spendByCountry([exp("2026-10-01", 500), exp("2026-11-01", 300), exp("2026-11-04", 200), exp("2026-11-05", 100)], days, "2026-11-05");
    expect(r.unassigned).toBe(500);
    expect(r.countries.map((c) => c.code)).toEqual(["VN", "TH"]);
    const vn = r.countries[0];
    expect(vn.spent).toBe(400);
    expect(vn.daysPlanned).toBe(5);
    expect(vn.daysSoFar).toBe(4); // 3 days first visit + today
    expect(vn.perDay).toBe(100);
    expect(r.countries[1].perDay).toBe(100);
  });

  it("has no per-day figure before arriving", () => {
    const r = spendByCountry([], days, "2026-10-20");
    expect(r.countries.every((c) => c.perDay === null && c.daysSoFar === 0)).toBe(true);
  });

  it("summarises finished visits, newest first, with the top category", () => {
    const s = finishedVisitSummaries(
      [exp("2026-11-01", 300, "food"), exp("2026-11-02", 400, "lodging"), exp("2026-11-03", 100, "food")],
      days,
      "2026-11-05"
    );
    expect(s.map((v) => v.code)).toEqual(["TH", "VN"]);
    expect(s[1]).toMatchObject({ nights: 3, spent: 700, topCategoryId: "lodging" });
    expect(s[1].perDay).toBeCloseTo(233.33, 1);
    expect(s[0]).toMatchObject({ nights: 2, spent: 100, topCategoryId: "food" });
  });

  it("draws sparkline points inside the box", () => {
    expect(sparkPoints([], 100, 20)).toBe("");
    const pts = sparkPoints([0, 10, 5], 100, 20).split(" ");
    expect(pts).toEqual(["2.0,18.0", "50.0,2.0", "98.0,10.0"]);
  });
});
