import { describe, expect, it } from "vitest";
import { buildIcs, escapeText, fold } from "./ics";
import type { Booking } from "@/lib/types";

const booking = (o: Partial<Booking>): Booking =>
  ({ id: "b1", type: "flight", title: "TLV - HAN", start_date: "2026-10-31", end_date: null, status: "paid", confirmation_code: "XK7Q2P", notes: null, details: { departure_time: "23:40", arrival_time: "17:05" }, ...o }) as Booking;

const base = {
  tripName: "המסע הגדול",
  stretches: [{ from: "2026-10-31", to: "2026-11-20", locationName: "וייטנאם - צפון", countryCode: "VN" }],
  countryName: (c: string) => c,
  typeLabel: (t: string) => ({ flight: "טיסה", hotel: "מלון" })[t] ?? t,
  now: new Date("2026-10-04T12:00:00Z"),
};

describe("ICS export (Phase 2.7)", () => {
  it("escapes text and folds long lines on character boundaries", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\;c\\\\d\\ne");
    const folded = fold("SUMMARY:" + "א".repeat(60));
    for (const part of folded.split("\r\n")) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe("SUMMARY:" + "א".repeat(60));
  });

  it("writes a valid calendar with stays (exclusive all-day end) and bookings", () => {
    const ics = buildIcs({ ...base, bookings: [booking({}), booking({ id: "b2", type: "hotel", title: "La Siesta", start_date: "2026-11-01", end_date: "2026-11-05", details: { check_in: "14:00" } })] });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261031\r\nDTEND;VALUE=DATE:20261121");
    // overnight flight: 23:40 → 17:05 ends the next day
    expect(ics).toContain("DTSTART:20261031T234000\r\nDTEND:20261101T170500");
    expect(ics).toContain("SUMMARY:טיסה: TLV - HAN");
    expect(ics).toContain("DESCRIPTION:#XK7Q2P");
    // hotel with check-in only: timed start, end at the same time on the last day
    expect(ics).toContain("DTSTART:20261101T140000\r\nDTEND:20261105T140000");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
  });

  it("skips cancelled and undated bookings and uses all-day when no times", () => {
    const ics = buildIcs({
      ...base,
      stretches: [],
      bookings: [booking({ status: "cancelled" }), booking({ id: "b3", start_date: null }), booking({ id: "b4", type: "other", title: "שייט", start_date: "2026-11-06", details: {} })],
    });
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261106\r\nDTEND;VALUE=DATE:20261107");
  });
});
