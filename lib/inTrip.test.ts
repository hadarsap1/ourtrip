import { describe, expect, it } from "vitest";
import { haversineKm, hhmm, homeClock, isEvening, leaveByMinutes, travelMinutes, zoneMinutes } from "./inTrip";

const hanoiOldQuarter = { lat: 21.0341, lng: 105.8516 };
const hanoiWestLake = { lat: 21.0583, lng: 105.8227 };

describe("in-trip helpers (1.6)", () => {
  it("measures distance", () => {
    expect(haversineKm(hanoiOldQuarter, hanoiWestLake)).toBeGreaterThan(3.5);
    expect(haversineKm(hanoiOldQuarter, hanoiWestLake)).toBeLessThan(4.5);
  });

  it("estimates travel with a buffer, rounded to 5", () => {
    expect(travelMinutes(hanoiOldQuarter, hanoiOldQuarter)).toBe(10);
    const t = travelMinutes(hanoiOldQuarter, hanoiWestLake);
    expect(t % 5).toBe(0);
    expect(t).toBeGreaterThanOrEqual(20);
  });

  it("computes leave-by only when both ends are known and the hop is short", () => {
    expect(leaveByMinutes(600, null, hanoiWestLake)).toBeNull();
    expect(leaveByMinutes(600, hanoiOldQuarter, hanoiWestLake)).toBe(600 - travelMinutes(hanoiOldQuarter, hanoiWestLake));
    expect(leaveByMinutes(600, hanoiOldQuarter, { lat: 10.77, lng: 106.7 })).toBeNull(); // Hanoi → Saigon
    expect(leaveByMinutes(5, hanoiOldQuarter, hanoiWestLake)).toBe(0);
  });

  it("formats and reads clocks", () => {
    expect(hhmm(0)).toBe("00:00");
    expect(hhmm(13 * 60 + 5)).toBe("13:05");
    const d = new Date("2026-11-10T05:00:00Z"); // winter: Israel UTC+2, Vietnam UTC+7
    expect(zoneMinutes(d, "Asia/Jerusalem")).toBe(7 * 60);
    expect(zoneMinutes(d, "Asia/Ho_Chi_Minh")).toBe(12 * 60);
    expect(homeClock(d, 12 * 60)).toBe("07:00");
    expect(homeClock(d, 7 * 60)).toBeNull();
  });

  it("knows when it is evening", () => {
    expect(isEvening(17 * 60 + 59)).toBe(false);
    expect(isEvening(18 * 60)).toBe(true);
  });
});
