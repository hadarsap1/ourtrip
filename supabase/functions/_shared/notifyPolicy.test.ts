import { describe, expect, it } from "vitest";
import {
  addDays,
  cancelDeadline,
  countryStretches,
  inQuietHours,
  isReminderDay,
  leaveNowDue,
  localNow,
  slotsDue,
  visaRemindersDue,
  zoneFor,
} from "./notifyPolicy";
import { leaveByMinutes, originFor } from "./travel";

describe("notification policy (1.11)", () => {
  it("maps countries to zones, unknown to Israel", () => {
    expect(zoneFor("VN")).toBe("Asia/Ho_Chi_Minh");
    expect(zoneFor("ge")).toBe("Asia/Tbilisi");
    expect(zoneFor("ZZ")).toBe("Asia/Jerusalem");
    expect(zoneFor(null)).toBe("Asia/Jerusalem");
  });

  it("reads local date and time, crossing midnight", () => {
    const d = new Date("2026-11-10T18:30:00Z");
    expect(localNow(d, "Asia/Ho_Chi_Minh")).toEqual({ date: "2026-11-11", minutes: 90 });
    expect(localNow(d, "Asia/Jerusalem")).toEqual({ date: "2026-11-10", minutes: 20 * 60 + 30 });
  });

  it("keeps quiet hours 22:00-07:00", () => {
    expect(inQuietHours(21 * 60 + 59)).toBe(false);
    expect(inQuietHours(22 * 60)).toBe(true);
    expect(inQuietHours(3 * 60)).toBe(true);
    expect(inQuietHours(7 * 60)).toBe(false);
  });

  it("fires slots on the local hour", () => {
    expect(slotsDue(9 * 60)).toEqual(["deadlines"]);
    expect(slotsDue(19 * 60 + 30)).toEqual(["tomorrowDigest"]);
    expect(slotsDue(20 * 60)).toEqual(["eveningJournal"]);
    expect(slotsDue(12 * 60)).toEqual([]);
  });

  it("fires leave-now once inside its window, never in quiet hours", () => {
    expect(leaveNowDue(600, 590)).toBe(true);
    expect(leaveNowDue(600, 600)).toBe(true);
    expect(leaveNowDue(600, 585)).toBe(false);
    expect(leaveNowDue(600, 601)).toBe(false);
    expect(leaveNowDue(22 * 60 + 5, 22 * 60)).toBe(false);
    expect(leaveNowDue(null, 600)).toBe(false);
  });

  it("picks the origin from the previous placed item, else the base", () => {
    const base = { lat: 21.03, lng: 105.85 };
    const a = { start_time: "09:00:00", lat: 21.04, lng: 105.79 };
    const b = { start_time: "12:00:00", lat: null, lng: null };
    const c = { start_time: "15:00:00", lat: 21.02, lng: 105.85 };
    expect(originFor([a, b, c], c, base)).toEqual({ lat: 21.04, lng: 105.79 });
    expect(originFor([a, b, c], a, base)).toEqual(base);
    expect(leaveByMinutes(900, originFor([a, b, c], c, base), c)).toBeLessThan(900);
  });

  it("reminds 7, 3 and 1 days before a deadline", () => {
    expect(isReminderDay("2026-11-01", "2026-11-08")).toBe(true);
    expect(isReminderDay("2026-11-05", "2026-11-08")).toBe(true);
    expect(isReminderDay("2026-11-07", "2026-11-08")).toBe(true);
    expect(isReminderDay("2026-11-06", "2026-11-08")).toBe(false);
    expect(isReminderDay("2026-11-07", null)).toBe(false);
  });

  it("reads the free-cancellation date from booking details only when well formed", () => {
    expect(cancelDeadline({ free_cancel_until: "2026-11-20" })).toBe("2026-11-20");
    expect(cancelDeadline({ free_cancel_until: "20/11/2026" })).toBeNull();
    expect(cancelDeadline(null)).toBeNull();
  });

  it("builds visa apply and stay-limit reminders", () => {
    const days = [
      ...Array.from({ length: 40 }, (_, i) => ({ date: addDays("2026-10-31", i), country_code: "VN" })),
      ...Array.from({ length: 35 }, (_, i) => ({ date: addDays("2026-12-10", i), country_code: "TH" })),
    ];
    expect(countryStretches(days).get("TH")).toEqual({ first: "2026-12-10", last: "2027-01-13" });
    const rows = [
      { country_code: "VN", requirement_type: "visa", status: "approved", max_days: 90, title_he: "ויזה וייטנאם" },
      { country_code: "TH", requirement_type: "none", status: "todo", max_days: 30, title_he: "פטור" },
      { country_code: "TH", requirement_type: "arrival_card", status: "todo", max_days: 30, title_he: "TDAC" },
    ];
    // TDAC: 3 days before entry
    expect(visaRemindersDue("2026-12-07", rows, days)).toEqual([{ country: "TH", title: "TDAC", kind: "apply", date: "2026-12-10" }]);
    // TH 30-day limit = 2027-01-08, stretch runs to 01-13 → reminder 7 days before
    expect(visaRemindersDue("2027-01-01", rows, days)).toEqual([{ country: "TH", title: "פטור", kind: "stay", date: "2027-01-08" }]);
    // VN 90 days fits the 40-day stretch → no stay reminder
    expect(visaRemindersDue("2026-11-20", rows, days)).toEqual([]);
  });
});
