import { describe, expect, it } from "vitest";
import { focusIndex, metroStops, type MetroLeg } from "./metroLine";

const leg = (key: string, countryCode: string | null, phase: MetroLeg["phase"]): MetroLeg => ({ key, label: key, countryCode, from: "2026-11-01", to: "2026-11-02", nights: 2, phase });

describe("metro line (Phase 2.5)", () => {
  it("marks interchanges and colours the outgoing track by the next country", () => {
    const stops = metroStops([leg("hanoi", "VN", "past"), leg("hoian", "VN", "current"), leg("bkk", "TH", "future")]);
    expect(stops.map((s) => s.newCountry)).toEqual([true, false, true]);
    expect(stops[0].trackOut).toBe("#C42B3A");
    expect(stops[1].trackOut).toBe("#3348A8");
    expect(stops[2].trackOut).toBeNull();
    expect(stops[2].color).toBe("#3348A8");
  });

  it("focuses the current stop, else the next, else the last", () => {
    expect(focusIndex([leg("a", "VN", "past"), leg("b", "VN", "current")])).toBe(1);
    expect(focusIndex([leg("a", "VN", "future"), leg("b", "VN", "future")])).toBe(0);
    expect(focusIndex([leg("a", "VN", "past"), leg("b", "TH", "past")])).toBe(1);
    expect(focusIndex([])).toBe(0);
  });
});
