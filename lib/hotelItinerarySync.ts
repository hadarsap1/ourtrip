// Letting a hotel booking correct the plan, rather than the plan mislabel it.
//
// WHY THIS EXISTS. The plan's days are typed in once, early, from a rough idea
// of the route. The hotel bookings come later and are the more reliable record
// of where the family actually sleeps: a Tokyo address is Tokyo, whatever the
// leg was called when the trip was sketched. When the two disagreed the plan
// won, and the bookings tab filed a Tokyo hotel under the Philippines. So the
// direction flips: a hotel proposes the place for the days it covers, and the
// family confirms.
//
// Pure and separate from the sheet for the same reason as bookingPlacement:
// which days a stay may rewrite, and what happens when two stays overlap, are
// worth testing directly.

import { addDays } from "@/lib/bookingCalendar";
import type { Booking, ItineraryDay } from "@/lib/types";

/** Where a hotel is, as the plan stores a place. */
export type HotelPlace = {
  locationName: string;
  countryCode: string | null;
  lat: number;
  lng: number;
};

/** One hotel and the days of the plan it would relabel. */
export type HotelSyncProposal = {
  booking: Booking;
  place: HotelPlace;
  /** The days to rewrite, in date order. Never empty. */
  days: ItineraryDay[];
};

/**
 * The dates a stay may relabel: the nights after check-in.
 *
 * Check-in day is left out on purpose. It is usually the travel day, and the
 * plan keeps a travel day under the place being left - that is where the
 * family wakes up and where the flight leaves from. Check-out day belongs to
 * the next leg. So a stay from the 22nd to the 30th relabels the 23rd-29th,
 * and a one-night stay relabels nothing.
 */
export function hotelStayDates(booking: Booking): string[] {
  if (booking.type !== "hotel" || booking.status === "cancelled") return [];
  if (!booking.start_date || !booking.end_date) return [];
  const dates: string[] = [];
  let cursor = addDays(booking.start_date, 1);
  // Same guard as bookingSpan: a typo'd year must not expand into thousands.
  let guard = 0;
  while (cursor < booking.end_date && guard++ < 400) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

/** A day already reads as this place - nothing to propose. Coordinates are
 *  not compared: two lookups of one address differ in the sixth decimal, and
 *  that must not bring the same prompt back on every save. A day with no
 *  coordinate at all is still worth filling, for its weather. */
function alreadyThere(day: ItineraryDay, place: HotelPlace): boolean {
  return (
    day.location_name === place.locationName &&
    day.country_code === place.countryCode &&
    day.lat != null &&
    day.lng != null
  );
}

/**
 * What each hotel would change, hotels in date order.
 *
 * Only days that exist are touched - a stay reaching past the plan does not
 * invent days. When two stays cover the same night the earlier booking keeps
 * it: overlapping active stays are a mistake to fix in the bookings, not a
 * question this can answer, and a night must not be proposed twice.
 */
export function proposeHotelSyncs(
  entries: { booking: Booking; place: HotelPlace }[],
  days: ItineraryDay[]
): HotelSyncProposal[] {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const claimed = new Set<string>();
  const ordered = [...entries].sort((a, b) =>
    (a.booking.start_date ?? "").localeCompare(b.booking.start_date ?? "")
  );

  const out: HotelSyncProposal[] = [];
  for (const { booking, place } of ordered) {
    const touched: ItineraryDay[] = [];
    for (const date of hotelStayDates(booking)) {
      if (claimed.has(date)) continue;
      claimed.add(date);
      const day = byDate.get(date);
      if (day && !alreadyThere(day, place)) touched.push(day);
    }
    if (touched.length > 0) out.push({ booking, place, days: touched });
  }
  return out;
}
