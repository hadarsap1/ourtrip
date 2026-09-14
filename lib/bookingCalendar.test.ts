import { describe, expect, it } from "vitest";
import {
  bookingDates,
  buildBookingIndex,
  buildLinkedIndex,
} from "./bookingCalendar";
import type { Booking } from "@/lib/types";

const booking = (over: Partial<Booking>): Booking =>
  ({
    id: over.id ?? "b",
    trip_id: "t",
    type: "hotel",
    title: "מלון",
    start_date: null,
    end_date: null,
    confirmation_code: null,
    cost: null,
    currency: null,
    status: "booked",
    file_path: null,
    link_url: null,
    details: {},
    notes: null,
    updated_at: "",
    ...over,
  }) as Booking;

describe("bookingDates", () => {
  it("covers the nights of a stay, not the morning of check-out", () => {
    // The real row: check in 31/10, check out 05/11 - five nights slept.
    expect(
      bookingDates(
        booking({ type: "hotel", start_date: "2026-10-31", end_date: "2026-11-05" })
      )
    ).toEqual([
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
    ]);
  });

  it("keeps the last date for everything that is not lodging", () => {
    expect(
      bookingDates(
        booking({ type: "car_rental", start_date: "2027-01-03", end_date: "2027-01-05" })
      )
    ).toEqual(["2027-01-03", "2027-01-04", "2027-01-05"]);
  });

  it("places a dateless-end booking on its single date", () => {
    // The real flight row: one start date, no end date.
    expect(
      bookingDates(booking({ type: "flight", start_date: "2026-10-31" }))
    ).toEqual(["2026-10-31"]);
  });

  it("collapses a one-night stay to the night itself", () => {
    expect(
      bookingDates(
        booking({ type: "hotel", start_date: "2027-04-14", end_date: "2027-04-15" })
      )
    ).toEqual(["2027-04-14"]);
  });

  it("ignores an end date that precedes the start rather than dropping the row", () => {
    // The trip holds exactly this: check-out 09/2026 on a stay starting 04/2027.
    expect(
      bookingDates(
        booking({ type: "hotel", start_date: "2027-04-02", end_date: "2026-09-10" })
      )
    ).toEqual(["2027-04-02"]);
  });

  it("places nothing for a booking with no start date", () => {
    expect(bookingDates(booking({ start_date: null }))).toEqual([]);
  });

  it("places nothing for a cancelled booking", () => {
    expect(
      bookingDates(
        booking({ status: "cancelled", start_date: "2027-03-22", end_date: "2027-03-30" })
      )
    ).toEqual([]);
  });

  it("does not run away on a typo'd year", () => {
    expect(
      bookingDates(
        booking({ type: "other", start_date: "2026-11-01", end_date: "2126-11-01" })
      ).length
    ).toBe(400);
  });
});

describe("buildBookingIndex", () => {
  it("puts every covered date in the index", () => {
    const index = buildBookingIndex([
      booking({ id: "h", type: "hotel", start_date: "2026-10-31", end_date: "2026-11-02" }),
    ]);
    expect([...index.keys()].sort()).toEqual(["2026-10-31", "2026-11-01"]);
    expect(index.get("2026-10-31")?.[0].isStart).toBe(true);
    expect(index.get("2026-11-01")?.[0].isStart).toBe(false);
    expect(index.get("2026-11-01")?.[0].isEnd).toBe(true);
    expect(index.get("2026-11-01")?.[0].nightIndex).toBe(2);
    expect(index.get("2026-11-01")?.[0].nightTotal).toBe(2);
  });

  it("orders a travel day transit first and the bed last", () => {
    const index = buildBookingIndex([
      booking({ id: "h", type: "hotel", title: "מלון", start_date: "2026-10-31", end_date: "2026-11-02" }),
      booking({ id: "f", type: "flight", title: "טיסה", start_date: "2026-10-31" }),
    ]);
    expect(index.get("2026-10-31")?.map((e) => e.booking.id)).toEqual(["f", "h"]);
  });

  it("hides a booking on the day it already shows as a linked item", () => {
    const index = buildBookingIndex(
      [booking({ id: "h", type: "hotel", start_date: "2026-10-31", end_date: "2026-11-03" })],
      new Map([["h", new Set(["2026-11-01"])]])
    );
    expect([...index.keys()].sort()).toEqual(["2026-10-31", "2026-11-02"]);
  });
});

describe("buildLinkedIndex", () => {
  it("maps a booking to the dates of the days that already link it", () => {
    const linked = buildLinkedIndex(
      [
        { day_id: "d1", booking_id: "b1" },
        { day_id: "d2", booking_id: null },
        { day_id: "d3", booking_id: "b1" },
      ],
      new Map([
        ["d1", "2026-11-01"],
        ["d2", "2026-11-02"],
        ["d3", "2026-11-03"],
      ])
    );
    expect([...(linked.get("b1") ?? [])].sort()).toEqual([
      "2026-11-01",
      "2026-11-03",
    ]);
  });
});
