import { describe, expect, it } from "vitest";
import { hotelStayDates, proposeHotelSyncs, type HotelPlace } from "./hotelItinerarySync";
import type { Booking, ItineraryDay } from "@/lib/types";

const day = (date: string, country: string | null, location: string | null): ItineraryDay =>
  ({
    id: `d-${date}`,
    date,
    country_code: country,
    location_name: location,
    lat: null,
    lng: null,
  }) as ItineraryDay;

const booking = (over: Partial<Booking>): Booking =>
  ({
    id: "b",
    trip_id: "t",
    type: "hotel",
    title: "מלון",
    start_date: null,
    end_date: null,
    status: "booked",
    details: {},
    ...over,
  }) as Booking;

const tokyo: HotelPlace = { locationName: "טוקיו", countryCode: "JP", lat: 35.7, lng: 139.8 };

/** The plan as sketched: the Philippines through the 22nd, then "Kyoto". */
const days = [
  day("2027-03-21", "PH", "פיליפינים"),
  day("2027-03-22", "PH", "פיליפינים"),
  day("2027-03-23", "JP", "קיוטו"),
  day("2027-03-24", "JP", "קיוטו"),
  day("2027-03-25", "JP", "קיוטו"),
];

describe("hotelStayDates", () => {
  it("covers the nights after check-in, not check-in or check-out", () => {
    const hotel = booking({ start_date: "2027-03-22", end_date: "2027-03-26" });
    expect(hotelStayDates(hotel)).toEqual(["2027-03-23", "2027-03-24", "2027-03-25"]);
  });

  it("is empty for a one-night stay, a cancelled stay, or anything not a hotel", () => {
    expect(hotelStayDates(booking({ start_date: "2027-03-22", end_date: "2027-03-23" }))).toEqual([]);
    expect(
      hotelStayDates(booking({ start_date: "2027-03-22", end_date: "2027-03-26", status: "cancelled" }))
    ).toEqual([]);
    expect(
      hotelStayDates(booking({ type: "flight", start_date: "2027-03-22", end_date: "2027-03-26" }))
    ).toEqual([]);
  });
});

describe("proposeHotelSyncs", () => {
  it("relabels the plan's days to where the hotel is", () => {
    const hotel = booking({ start_date: "2027-03-22", end_date: "2027-03-30" });
    const [proposal, ...rest] = proposeHotelSyncs([{ booking: hotel, place: tokyo }], days);

    expect(rest).toHaveLength(0);
    // The travel day (22nd) stays in the Philippines; days past the plan are not invented.
    expect(proposal.days.map((d) => d.date)).toEqual(["2027-03-23", "2027-03-24", "2027-03-25"]);
  });

  it("proposes nothing when the days already read as that place", () => {
    const placed = days.map((d) =>
      d.country_code === "JP" ? { ...d, location_name: "טוקיו", lat: 35.6, lng: 139.7 } : d
    );
    const hotel = booking({ start_date: "2027-03-22", end_date: "2027-03-30" });
    expect(proposeHotelSyncs([{ booking: hotel, place: tokyo }], placed)).toEqual([]);
  });

  it("gives an overlapping night to the earlier booking only", () => {
    const first = booking({ id: "a", start_date: "2027-03-22", end_date: "2027-03-25" });
    const second = booking({ id: "b", start_date: "2027-03-23", end_date: "2027-03-27" });
    const osaka: HotelPlace = { ...tokyo, locationName: "אוסקה" };
    const proposals = proposeHotelSyncs(
      [
        { booking: second, place: osaka },
        { booking: first, place: tokyo },
      ],
      days
    );

    expect(proposals.map((p) => p.booking.id)).toEqual(["a", "b"]);
    expect(proposals[0].days.map((d) => d.date)).toEqual(["2027-03-23", "2027-03-24"]);
    expect(proposals[1].days.map((d) => d.date)).toEqual(["2027-03-25"]);
  });
});
