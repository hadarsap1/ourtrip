import { describe, expect, it } from "vitest";
import { buildKidRoute } from "./kidRoute";
import type { ItineraryDay, ItineraryItem } from "@/lib/types";

const day = (id: string, date: string, place: string, cc = "TH"): ItineraryDay =>
  ({ id, date, location_name: place, country_code: cc, trip_id: "t", lat: null, lng: null, notes: null, updated_at: "" }) as ItineraryDay;
const item = (id: string, dayId: string, title: string, status = "planned", start: string | null = null): ItineraryItem =>
  ({ id, day_id: dayId, title, status, start_time: start }) as unknown as ItineraryItem;

describe("buildKidRoute", () => {
  const days = [
    day("d1", "2026-11-01", "בנגקוק"),
    day("d2", "2026-11-02", "בנגקוק"),
    day("d3", "2026-11-03", "צ'יאנג מאי"),
    day("d4", "2026-11-04", "צ'יאנג מאי"),
    day("d5", "2026-11-05", "האנוי", "VN"),
  ];

  it("starts today and groups consecutive days at one place into a stop", () => {
    const stops = buildKidRoute(days, [], "2026-11-02");
    expect(stops.map((s) => [s.place, s.from, s.to, s.dayCount])).toEqual([
      ["בנגקוק", "2026-11-02", "2026-11-02", 1],
      ["צ'יאנג מאי", "2026-11-03", "2026-11-04", 2],
      ["האנוי", "2026-11-05", "2026-11-05", 1],
    ]);
    expect(stops.map((s) => s.isNow)).toEqual([true, false, false]);
  });

  it("lists only the days with plans, and drops cancelled plans", () => {
    const stops = buildKidRoute(
      days,
      [item("i1", "d3", "שוק לילה", "planned", "19:00"), item("i2", "d4", "בוטל", "cancelled"), item("i3", "d1", "עבר")],
      "2026-11-02"
    );
    const chiangMai = stops[1];
    expect(chiangMai.plannedDays).toEqual([{ date: "2026-11-03", items: [{ id: "i1", title: "שוק לילה", time: "19:00" }] }]);
    expect(stops[0].plannedDays).toEqual([]);
  });

  it("is empty after the last day", () => {
    expect(buildKidRoute(days, [], "2026-12-01")).toEqual([]);
  });
});
