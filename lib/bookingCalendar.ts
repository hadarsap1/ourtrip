// Projects bookings onto the dates they actually occupy.
//
// WHY THIS EXISTS: bookings were a parallel silo. They lived in their own tab
// and reached a day only if someone pressed "add to day", which created a COPY
// of the booking as an itinerary item. With seven real bookings in the trip,
// exactly one item had ever been linked that way - so a booked hotel appeared
// nowhere in the calendar or the day list, and the plan looked emptier than it
// was. A booking already carries the dates it covers; nothing should have to be
// re-entered for it to show up on them.
//
// Kept pure and separate from the views for the same reason as
// itineraryCalendar: the span rules (a hotel covers check-in through the night
// before check-out, a flight covers one date) are worth testing directly rather
// than eyeballing a month grid.

import type { Booking } from "@/lib/types";
import { iso } from "@/lib/itineraryCalendar";

/** One booking as it appears on one specific date. */
export type BookingOnDate = {
  booking: Booking;
  /** The booking's own start date. */
  isStart: boolean;
  /** The last date the booking occupies (check-out day for lodging). */
  isEnd: boolean;
  /** True when the booking occupies more than one date. */
  isRange: boolean;
  /** 1-based position within the span; 1 on the start date. */
  nightIndex: number;
  /** Total dates the booking occupies. */
  nightTotal: number;
};

/** Transit first, bed last: that is the order of a travel day. Within a type,
 *  title keeps it stable so two hotels don't swap places between renders. */
export const TYPE_ORDER: Record<Booking["type"], number> = {
  flight: 0,
  train: 1,
  car_rental: 2,
  attraction: 3,
  other: 4,
  hotel: 5,
};

/** A typo'd year must not expand into thousands of dates - same guard, and the
 *  same reason, as MAX_LEG_DAYS in itineraryCalendar. */
const MAX_SPAN_DAYS = 400;

/** Lodging occupies the nights between check-in and check-out, so the guest is
 *  not "at the hotel" on the morning they leave - a five-night stay should
 *  shade five dates, not six. Every other type occupies its dates inclusively:
 *  a car rented on the 3rd and returned on the 7th is yours on the 7th. */
function occupiesCheckoutDate(type: Booking["type"]): boolean {
  return type !== "hotel";
}

function addDays(dateISO: string, delta: number): string {
  const d = new Date(`${dateISO}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return iso(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * The dates one booking occupies, earliest first.
 *
 * Returns nothing for a booking with no start date (there is no date to place
 * it on) or a cancelled one (it is not happening, so it must not shade a day -
 * this trip already has a cancelled and a booked hotel on the same night, and
 * showing both would state a contradiction). Cancelled bookings stay fully
 * visible in the bookings list, which is where a cancellation is managed.
 *
 * An end date before the start date is treated as absent rather than dropped:
 * the trip has exactly such a row (check-out 09/2026 on a stay starting
 * 04/2027), and the booking is still real. The form now rejects new ones.
 */
export function bookingDates(booking: Booking): string[] {
  if (booking.status === "cancelled") return [];
  return bookingSpan(booking);
}

/**
 * The same dates, but without the cancelled check.
 *
 * A cancelled booking must not shade a day on the plan, which is why
 * `bookingDates` drops it - but it is still listed, and the list groups every
 * booking under the leg of the trip it belongs to. "Cancelled" is a fact about
 * the booking, not a reason to stop knowing where it was.
 */
export function bookingSpan(booking: Booking): string[] {
  if (!booking.start_date) return [];

  const start = booking.start_date;
  const rawEnd = booking.end_date;
  const end = rawEnd && rawEnd > start ? rawEnd : start;

  const last = occupiesCheckoutDate(booking.type) ? end : addDays(end, -1);
  // A one-night stay (check-in 1st, check-out 2nd) collapses to the 1st, and a
  // same-day end collapses to the start - never to an empty span.
  if (last <= start) return [start];

  const dates: string[] = [];
  let cursor = start;
  let guard = 0;
  while (cursor <= last && guard++ < MAX_SPAN_DAYS) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

/**
 * Every booking indexed by the dates it covers.
 *
 * `hiddenOn` suppresses a booking on days where it is already on screen as a
 * linked itinerary item - "add to day" still exists, and without this the same
 * hotel would appear twice on the same day. Keyed `bookingId` -> set of day
 * dates.
 */
export function buildBookingIndex(
  bookings: Booking[],
  hiddenOn?: Map<string, Set<string>>
): Map<string, BookingOnDate[]> {
  const byDate = new Map<string, BookingOnDate[]>();

  for (const booking of bookings) {
    const dates = bookingDates(booking);
    if (dates.length === 0) continue;
    const hidden = hiddenOn?.get(booking.id);

    dates.forEach((date, index) => {
      if (hidden?.has(date)) return;
      const entry: BookingOnDate = {
        booking,
        isStart: index === 0,
        isEnd: index === dates.length - 1,
        isRange: dates.length > 1,
        nightIndex: index + 1,
        nightTotal: dates.length,
      };
      const list = byDate.get(date);
      if (list) list.push(entry);
      else byDate.set(date, [entry]);
    });
  }

  for (const list of byDate.values()) {
    list.sort(
      (a, b) =>
        TYPE_ORDER[a.booking.type] - TYPE_ORDER[b.booking.type] ||
        a.booking.title.localeCompare(b.booking.title, "he")
    );
  }

  return byDate;
}

/** Days that already show this booking as a linked itinerary item, so the
 *  projection can skip them. Built from the items and days the screen already
 *  holds, so it costs no extra query. */
export function buildLinkedIndex(
  items: { day_id: string; booking_id: string | null }[],
  dayDateById: Map<string, string>
): Map<string, Set<string>> {
  const linked = new Map<string, Set<string>>();
  for (const item of items) {
    if (!item.booking_id) continue;
    const date = dayDateById.get(item.day_id);
    if (!date) continue;
    const set = linked.get(item.booking_id);
    if (set) set.add(date);
    else linked.set(item.booking_id, new Set([date]));
  }
  return linked;
}
