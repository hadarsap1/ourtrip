// Tying every booking to the leg of the trip it belongs to.
//
// WHY THIS EXISTS. The bookings tab was a flat, date-sorted list of names:
// "Hanoi Old Quarter Hotel", "Ha Long day cruise", "VN1546". A round-the-world
// trip crosses seven countries and dozens of towns, and a name on its own says
// nothing about which of them it is for - so reading the list meant opening
// every row, or holding the whole route in your head. The information was
// always there: a booking carries the dates it covers, and `itinerary_days`
// carries a country and a label per date. Nothing joined the two.
//
// So the join happens here, and nothing new is stored: no column, no migration,
// no second place to keep in sync when a leg moves. Change the days a leg
// covers and the bookings follow it.
//
// Pure and separate from the views for the same reason as bookingCalendar: the
// awkward cases (a flight that leaves one leg and lands in the next, a booking
// whose dates fall in a hole in the plan, a booking with no date at all) are
// worth testing directly rather than eyeballing a list.

import { TYPE_ORDER, bookingSpan } from "@/lib/bookingCalendar";
import { splitIntoStretches, type Stretch } from "@/lib/data/segments";
import type { Booking, ItineraryDay } from "@/lib/types";

/** Why a booking could not be tied to a leg. */
export type UnplacedReason =
  /** No start date, so there is nothing to place it by. */
  | "no_date"
  /** It has dates, but none of them is a day in the plan. */
  | "outside_plan";

/** One booking and the part of the trip it sits in. */
export type BookingPlacement = {
  booking: Booking;
  /**
   * The legs the booking's dates touch, in date order. Usually one; a flight
   * between countries touches two, and that is exactly the row a reader needs
   * to see as crossing rather than as belonging to either side.
   */
  stretches: Stretch[];
  /** Null when the booking is placed. */
  unplaced: UnplacedReason | null;
};

/** A leg of the trip and the bookings that start in it. */
export type BookingGroup = {
  /** Stable across renders; legs repeat by name, so the index is part of it. */
  key: string;
  /** Null for the trailing group of bookings that reach no leg. */
  stretch: Stretch | null;
  bookings: BookingPlacement[];
};

/** Chronological, then transit before beds, then name - the order a leg is
 *  actually lived in. Bookings with no date sort last. */
function compare(a: BookingPlacement, b: BookingPlacement): number {
  const da = a.booking.start_date ?? "9999-12-31";
  const db = b.booking.start_date ?? "9999-12-31";
  return (
    da.localeCompare(db) ||
    TYPE_ORDER[a.booking.type] - TYPE_ORDER[b.booking.type] ||
    a.booking.title.localeCompare(b.booking.title, "he")
  );
}

/**
 * Every booking grouped under the leg it starts in, legs in trip order.
 *
 * A booking belongs to where it STARTS, even when it spans a change of place:
 * the flight out of Hanoi is part of the Hanoi leg, because that is where you
 * are when you have to be at the airport. Its `stretches` still carry both
 * ends, so the row can say it crosses.
 *
 * Empty legs are dropped - a list with a heading for every one of the trip's
 * towns, most of them holding nothing, is harder to read than the flat list it
 * replaced. Whatever reaches no leg lands in one group at the end, which is the
 * only part of this list that is a to-do: a booking with no date, or one whose
 * dates fall outside the plan, is usually a typo rather than a decision.
 */
export function groupBookingsByLeg(
  bookings: Booking[],
  days: ItineraryDay[]
): BookingGroup[] {
  const stretches = splitIntoStretches(days);

  const legByDate = new Map<string, number>();
  stretches.forEach((stretch, index) => {
    for (const day of stretch.days) legByDate.set(day.date, index);
  });

  const groups: BookingGroup[] = stretches.map((stretch, index) => ({
    key: `leg-${index}`,
    stretch,
    bookings: [],
  }));
  const unplaced: BookingPlacement[] = [];

  for (const booking of bookings) {
    // Deliberately the span and not `bookingDates`: a cancelled booking still
    // belongs to a place, it just must not shade the day.
    const dates = bookingSpan(booking);
    if (dates.length === 0) {
      unplaced.push({ booking, stretches: [], unplaced: "no_date" });
      continue;
    }

    // Dates are ascending, so the legs come out in trip order already.
    const touched: number[] = [];
    for (const date of dates) {
      const index = legByDate.get(date);
      if (index === undefined) continue;
      if (touched[touched.length - 1] === index) continue;
      if (!touched.includes(index)) touched.push(index);
    }

    if (touched.length === 0) {
      unplaced.push({ booking, stretches: [], unplaced: "outside_plan" });
      continue;
    }

    groups[touched[0]].bookings.push({
      booking,
      stretches: touched.map((index) => stretches[index]),
      unplaced: null,
    });
  }

  const out = groups.filter((group) => group.bookings.length > 0);
  for (const group of out) group.bookings.sort(compare);
  if (unplaced.length > 0) {
    out.push({ key: "unplaced", stretch: null, bookings: unplaced.sort(compare) });
  }
  return out;
}
