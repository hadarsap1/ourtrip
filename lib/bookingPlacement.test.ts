import { describe, expect, it } from "vitest";
import { groupBookingsByLeg } from "./bookingPlacement";
import type { Booking, ItineraryDay } from "@/lib/types";

const day = (date: string, country: string | null, location: string | null): ItineraryDay =>
  ({ id: `d-${date}`, date, country_code: country, location_name: location }) as ItineraryDay;

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

/** Three days in north Vietnam, then two in Thailand. */
const days = [
  day("2026-10-31", "VN", "וייטנאם - צפון"),
  day("2026-11-01", "VN", "וייטנאם - צפון"),
  day("2026-11-02", "VN", "וייטנאם - צפון"),
  day("2026-11-03", "TH", "תאילנד"),
  day("2026-11-04", "TH", "תאילנד"),
];

describe("groupBookingsByLeg", () => {
  it("files a booking under the leg its dates fall in", () => {
    const hotel = booking({
      id: "h",
      type: "hotel",
      start_date: "2026-10-31",
      end_date: "2026-11-02",
    });
    const groups = groupBookingsByLeg([hotel], days);

    expect(groups).toHaveLength(1);
    expect(groups[0].stretch?.locationName).toBe("וייטנאם - צפון");
    expect(groups[0].bookings[0].booking.id).toBe("h");
    expect(groups[0].bookings[0].stretches).toHaveLength(1);
  });

  it("files a crossing booking under where it starts, and keeps both ends", () => {
    // The flight leaves Hanoi on the last Vietnam day and lands in Thailand.
    const flight = booking({
      id: "f",
      type: "flight",
      title: "VN610",
      start_date: "2026-11-02",
      end_date: "2026-11-03",
    });
    const groups = groupBookingsByLeg([flight], days);

    expect(groups).toHaveLength(1);
    expect(groups[0].stretch?.locationName).toBe("וייטנאם - צפון");
    expect(groups[0].bookings[0].stretches.map((s) => s.locationName)).toEqual([
      "וייטנאם - צפון",
      "תאילנד",
    ]);
  });

  it("keeps legs in trip order and drops the empty ones", () => {
    const groups = groupBookingsByLeg(
      [
        booking({ id: "th", start_date: "2026-11-03", end_date: "2026-11-04" }),
        booking({ id: "vn", start_date: "2026-10-31", end_date: "2026-11-01" }),
      ],
      [...days, day("2026-11-05", "KH", "קמבודיה")]
    );

    expect(groups.map((g) => g.stretch?.countryCode)).toEqual(["VN", "TH"]);
  });

  it("orders a leg chronologically, transit before beds on the same date", () => {
    const groups = groupBookingsByLeg(
      [
        booking({ id: "bed", type: "hotel", start_date: "2026-10-31", end_date: "2026-11-02" }),
        booking({ id: "later", type: "attraction", start_date: "2026-11-01" }),
        booking({ id: "flight", type: "flight", start_date: "2026-10-31" }),
      ],
      days
    );

    expect(groups[0].bookings.map((p) => p.booking.id)).toEqual([
      "flight",
      "bed",
      "later",
    ]);
  });

  it("still places a cancelled booking - it is not happening, but it had a place", () => {
    const groups = groupBookingsByLeg(
      [booking({ id: "x", status: "cancelled", start_date: "2026-11-03" })],
      days
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].stretch?.countryCode).toBe("TH");
  });

  it("collects what reaches no leg into one trailing group, with the reason", () => {
    const groups = groupBookingsByLeg(
      [
        booking({ id: "placed", start_date: "2026-10-31" }),
        booking({ id: "undated" }),
        booking({ id: "elsewhere", start_date: "2027-04-01" }),
      ],
      days
    );

    const last = groups[groups.length - 1];
    expect(last.stretch).toBeNull();
    expect(last.bookings.map((p) => [p.booking.id, p.unplaced])).toEqual([
      ["elsewhere", "outside_plan"],
      ["undated", "no_date"],
    ]);
  });

  it("returns nothing but the unplaced group when the trip has no days yet", () => {
    const groups = groupBookingsByLeg([booking({ start_date: "2026-10-31" })], []);

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("unplaced");
  });

  it("has no groups at all with no bookings", () => {
    expect(groupBookingsByLeg([], days)).toEqual([]);
  });
});
