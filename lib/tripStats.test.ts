import { describe, expect, it } from "vitest";
import { passportStamps, stampTilt, tripStats } from "./tripStats";

const day = (id: string, date: string, cc: string | null) => ({ id, date, country_code: cc });
const days = [day("1", "2026-10-31", "VN"), day("2", "2026-11-01", "VN"), day("3", "2026-11-02", "TH"), day("4", "2026-11-03", "VN"), day("5", "2026-11-04", "KH")];
const item = (day_id: string, lat: number, lng: number) => ({ day_id, lat, lng, status: "planned" }) as never;

describe("stats & stamps (Phase 2.6)", () => {
  it("counts countries, days and nights so far", () => {
    const s = tripStats(days, [], "2026-11-03");
    expect(s).toMatchObject({ countriesVisited: 2, countriesTotal: 3, daysDone: 4, daysTotal: 5 });
    expect(s.nightsByCountry).toEqual([{ code: "VN", nights: 3 }, { code: "TH", nights: 1 }]);
  });

  it("measures planned km between day centroids, and the part already travelled", () => {
    const s = tripStats(days, [item("1", 21.03, 105.85), item("3", 13.75, 100.5), item("5", 13.36, 103.86)], "2026-11-02");
    expect(s.kmPlanned).toBeGreaterThan(s.kmSoFar);
    expect(s.kmSoFar).toBeGreaterThan(900); // Hanoi → Bangkok ~ 990 km
    expect(s.kmSoFar).toBeLessThan(1100);
  });

  it("gives one stamp per country in first-arrival order, earned on arrival", () => {
    expect(passportStamps(days, "2026-11-02")).toEqual([
      { code: "VN", firstDate: "2026-10-31", earned: true },
      { code: "TH", firstDate: "2026-11-02", earned: true },
      { code: "KH", firstDate: "2026-11-04", earned: false },
    ]);
  });

  it("tilts stamps stably within ±8°", () => {
    expect(stampTilt("VN")).toBe(stampTilt("VN"));
    for (const c of ["VN", "TH", "KH", "LA", "PH", "JP", "GE"]) expect(Math.abs(stampTilt(c))).toBeLessThanOrEqual(8);
  });
});
