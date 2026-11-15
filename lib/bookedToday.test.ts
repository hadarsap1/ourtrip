import { describe, expect, it } from "vitest";
import { bookedToday } from "./bookedToday";
import type { Booking, ItineraryItem } from "@/lib/types";

const item = (o: Partial<ItineraryItem>): ItineraryItem =>
  ({ id: "i", day_id: "d", title: "item", start_time: null, end_time: null, location_name: null, lat: null, lng: null, status: "planned", booking_id: null, ...o }) as ItineraryItem;
const booking = (o: Partial<Booking>): Booking =>
  ({ id: "b", trip_id: "t", type: "attraction", title: "booking", confirmation_code: null, status: "booked", ...o }) as Booking;

describe("bookedToday", () => {
  it("lists nothing when nothing was booked, whatever the plan holds", () => {
    expect(bookedToday([item({ id: "1", title: "breakfast", start_time: "08:00" })], [], null)).toEqual([]);
  });

  it("shows a booking with its item's time and place, and its code", () => {
    const rows = bookedToday(
      [item({ id: "1", title: "Cooking class", start_time: "14:00", location_name: "School", booking_id: "b1", lat: 1, lng: 2 })],
      [booking({ id: "b1", title: "class", confirmation_code: "X9" })],
      null
    );
    expect(rows).toEqual([{ key: "b-b1", title: "Cooking class", time: "14:00", place: "School", code: "X9", lat: 1, lng: 2 }]);
  });

  it("lists a booking with no item by its own title, and an item whose booking is not among today's", () => {
    const rows = bookedToday(
      [item({ id: "2", title: "Night train", start_time: "21:00", booking_id: "other" })],
      [booking({ id: "b1", title: "Museum tickets" })],
      null
    );
    expect(rows.map((r) => r.title)).toEqual(["Night train", "Museum tickets"]);
  });

  it("leaves out the bed, finished items, and sorts by time with untimed last", () => {
    const hotel = booking({ id: "h", type: "hotel", title: "Hotel" });
    const rows = bookedToday(
      [
        item({ id: "1", title: "Late", start_time: "18:00", booking_id: "b2" }),
        item({ id: "2", title: "Early", start_time: "09:00", booking_id: "b1" }),
        item({ id: "3", title: "Done", start_time: "07:00", booking_id: "b3", status: "done" }),
        item({ id: "4", title: "Check-in", booking_id: "h" }),
      ],
      [hotel, booking({ id: "b1" }), booking({ id: "b2" }), booking({ id: "b3" }), booking({ id: "b4", title: "Untimed" })],
      hotel
    );
    expect(rows.map((r) => r.title)).toEqual(["Early", "Late", "Untimed"]);
  });
});
