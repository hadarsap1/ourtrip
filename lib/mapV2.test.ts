import { describe, expect, it } from "vitest";
import { countryHex, dayCentroids, itemGlyph, tripSegments } from "./mapV2";

const days = [
  { id: "d2", date: "2026-11-02", country_code: "VN" },
  { id: "d1", date: "2026-11-01", country_code: "VN" },
  { id: "d3", date: "2026-11-03", country_code: "TH" },
  { id: "d4", date: "2026-11-04", country_code: "TH" },
];
const item = (day_id: string, lat: number | null, lng: number | null, status = "planned") => ({ day_id, lat, lng, status }) as never;

describe("map v2 helpers (Phase 2.9)", () => {
  it("colours by country with a neutral fallback", () => {
    expect(countryHex("vn")).toBe("#C42B3A");
    expect(countryHex(null)).toBe("#66717B");
    expect(countryHex("FR")).toBe("#66717B");
  });

  it("averages each day's located, live items in date order", () => {
    const pts = dayCentroids(days, [item("d2", 10, 20), item("d2", 12, 22), item("d1", 1, 1), item("d1", null, null), item("d3", 5, 5, "cancelled")]);
    expect(pts.map((p) => p.dayId)).toEqual(["d1", "d2"]);
    expect(pts[1]).toMatchObject({ lat: 11, lng: 21, country: "VN" });
  });

  it("joins days with segments coloured by the arrival country, skipping same-place hops", () => {
    const pts = dayCentroids(days, [item("d1", 1, 1), item("d2", 1, 1), item("d3", 13.7, 100.5), item("d4", 18.8, 98.9)]);
    const segs = tripSegments(pts);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ color: "#3348A8" });
    expect(segs[0].from.dayId).toBe("d2");
  });

  it("gives booking-linked items their type glyph", () => {
    const byId = new Map([["b1", { type: "hotel" as const }]]);
    expect(itemGlyph({ booking_id: "b1" }, byId)).toBe("🏨");
    expect(itemGlyph({ booking_id: null }, byId)).toBeNull();
  });
});
