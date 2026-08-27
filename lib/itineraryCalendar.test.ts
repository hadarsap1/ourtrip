import { describe, expect, it } from "vitest";
import { buildCalendarIndex, legEndISO } from "./itineraryCalendar";
import type { ItineraryDay, ItineraryItem } from "@/lib/types";

const day = (over: Partial<ItineraryDay>): ItineraryDay =>
  ({
    id: over.date ?? "d",
    trip_id: "t",
    date: "2026-11-01",
    location_name: null,
    country_code: null,
    lat: null,
    lng: null,
    notes: null,
    updated_at: "",
    ...over,
  }) as ItineraryDay;

const item = (dayId: string): ItineraryItem => ({ day_id: dayId }) as ItineraryItem;

describe("legEndISO", () => {
  it("reads a range out of the notes an import writes", () => {
    expect(legEndISO(day({ date: "2026-11-01", notes: "1.11 - 22.11" }))).toBe(
      "2026-11-22"
    );
  });

  it("rolls into the next year when the range wraps past new year", () => {
    expect(legEndISO(day({ date: "2026-12-20", notes: "20.12 - 10.1" }))).toBe(
      "2027-01-10"
    );
  });

  it("honours an explicit year rather than inferring one", () => {
    expect(legEndISO(day({ date: "2026-11-01", notes: "1.11 - 22.11.2027" }))).toBe(
      "2027-11-22"
    );
  });

  it("is null when the notes hold no range", () => {
    expect(legEndISO(day({ notes: "לינה במרכז העיר" }))).toBeNull();
    expect(legEndISO(day({ notes: null }))).toBeNull();
  });

  it("rejects an impossible date instead of producing a bogus span", () => {
    expect(legEndISO(day({ date: "2026-11-01", notes: "1.11 - 45.99" }))).toBeNull();
  });
});

describe("buildCalendarIndex", () => {
  it("gives a single day one cell carrying its label and count", () => {
    const d = day({ date: "2026-11-03", location_name: "הוי אן", country_code: "VN" });
    const { cells } = buildCalendarIndex([d], [item(d.id), item(d.id)]);

    expect(cells.size).toBe(1);
    expect(cells.get("2026-11-03")).toMatchObject({
      isStart: true,
      label: "הוי אן",
      countryCode: "VN",
      itemCount: 2,
      opensDate: "2026-11-03",
    });
  });

  it("covers every date of a leg, all opening the leg's start", () => {
    const d = day({
      date: "2026-11-01",
      notes: "1.11 - 22.11",
      location_name: "הוי אן",
    });
    const { cells } = buildCalendarIndex([d], []);

    expect(cells.size).toBe(22);
    expect(cells.get("2026-11-01")?.isStart).toBe(true);
    expect(cells.get("2026-11-12")).toMatchObject({
      isStart: false,
      label: "הוי אן",
      opensDate: "2026-11-01",
    });
    expect(cells.get("2026-11-23")).toBeUndefined();
  });

  it("labels covered dates but never repeats the activity count across them", () => {
    // "5 activities" shown on all 22 days of a leg would be a lie — the
    // activities belong to the day row, not to each date it spans.
    const d = day({ date: "2026-11-01", notes: "1.11 - 5.11", location_name: "דה לאט" });
    const { cells } = buildCalendarIndex([d], [item(d.id), item(d.id)]);

    expect(cells.get("2026-11-01")?.itemCount).toBe(2);
    expect(cells.get("2026-11-03")?.itemCount).toBe(0);
    expect(cells.get("2026-11-03")?.label).toBe("דה לאט");
  });

  it("falls back to the country code when a day has no location", () => {
    const d = day({ date: "2026-11-01", location_name: null, country_code: "LA" });
    expect(buildCalendarIndex([d], []).cells.get("2026-11-01")?.label).toBe("LA");
  });

  it("lets a real day win over a leg that covers its date", () => {
    const leg = day({ id: "leg", date: "2026-11-01", notes: "1.11 - 10.11", location_name: "הוי אן" });
    const inner = day({ id: "inner", date: "2026-11-05", location_name: "דה נאנג" });
    const { cells } = buildCalendarIndex([leg, inner], []);

    expect(cells.get("2026-11-05")).toMatchObject({
      isStart: true,
      label: "דה נאנג",
      opensDate: "2026-11-05",
    });
  });

  it("spans every month the trip touches, in order", () => {
    // Padding is off here so this stays a test of span derivation; the
    // padding behaviour has its own tests below.
    const { months } = buildCalendarIndex(
      [
        day({ id: "a", date: "2026-11-01" }),
        day({ id: "b", date: "2027-01-15" }),
      ],
      [],
      { monthsBefore: 0, monthsAfter: 0 }
    );
    expect(months).toEqual([
      { y: 2026, m: 10 },
      { y: 2026, m: 11 },
      { y: 2027, m: 0 },
    ]);
  });

  it("is empty for an empty itinerary with no anchor, rather than throwing", () => {
    const { cells, months } = buildCalendarIndex([], []);
    expect(cells.size).toBe(0);
    expect(months).toEqual([]);
  });
});

// The grid used to stop dead at the first and last planned day, so a date
// outside the span could not be tapped and the trip could not be extended
// from the calendar. It now reaches past both ends.
describe("buildCalendarIndex — month range", () => {
  const nov = day({ id: "a", date: "2026-11-10" });

  it("pads a month either side of the trip by default", () => {
    expect(buildCalendarIndex([nov], []).months).toEqual([
      { y: 2026, m: 9 },
      { y: 2026, m: 10 },
      { y: 2026, m: 11 },
    ]);
  });

  it("reaches further when asked, crossing year boundaries correctly", () => {
    const months = buildCalendarIndex([nov], [], {
      monthsBefore: 2,
      monthsAfter: 3,
    }).months;
    expect(months[0]).toEqual({ y: 2026, m: 8 });
    expect(months[months.length - 1]).toEqual({ y: 2027, m: 1 });
    expect(months).toHaveLength(6);
  });

  it("can be asked for no padding at all", () => {
    expect(
      buildCalendarIndex([nov], [], { monthsBefore: 0, monthsAfter: 0 }).months
    ).toEqual([{ y: 2026, m: 10 }]);
  });

  it("treats a negative pad as zero rather than walking backwards", () => {
    expect(
      buildCalendarIndex([nov], [], { monthsBefore: -3, monthsAfter: -3 }).months
    ).toEqual([{ y: 2026, m: 10 }]);
  });

  it("centres on the anchor when the itinerary is empty", () => {
    // With no days there is no span; without an anchor the calendar would have
    // nothing to draw and nowhere to start a trip from.
    expect(buildCalendarIndex([], [], { anchorDate: "2026-12-15" }).months).toEqual([
      { y: 2026, m: 10 },
      { y: 2026, m: 11 },
      { y: 2027, m: 0 },
    ]);
  });

  it("still renders nothing when empty and given no anchor", () => {
    expect(buildCalendarIndex([], []).months).toEqual([]);
  });

  it("pads around the far end of a leg, not just its start date", () => {
    const leg = day({ id: "leg", date: "2026-11-20", notes: "20.11 - 10.12" });
    const months = buildCalendarIndex([leg], []).months;
    expect(months[months.length - 1]).toEqual({ y: 2027, m: 0 });
  });
});
