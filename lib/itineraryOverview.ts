// The trip as its legs, with enough on each one to judge it without opening it.
//
// WHY THIS EXISTS. The itinerary tab rendered one card per day. For this trip
// that is 230 cards, 228 of them empty, in a flat list with no headings and no
// way to jump - so the screen showed a wall of nothing and hid the only two
// days that had anything on them. Worse, the trip does have a shape (21 nights
// in northern Vietnam, 38 in Thailand, eight separate legs across Japan), and
// none of it was on screen.
//
// The shape was already derivable: `splitIntoStretches` breaks the days into
// the runs they read as, and that is what bookingPlacement has been grouping
// bookings by since the bookings tab was rebuilt. This module puts numbers on
// each of those runs - what is planned, what is booked, and how many ideas are
// still sitting in the bank unplaced - so a leg can be summarised in one row.
//
// Pure, and separate from the view, for the same reason as bookingCalendar and
// bookingPlacement: the interesting cases (a booking that spans two legs, a
// leg whose label names no town the bank knows, a trip that has not started)
// are worth asserting directly rather than eyeballing a list of fourteen rows.

import { bookingDates } from "@/lib/bookingCalendar";
import {
  areaChoicesForStretch,
  splitIntoStretches,
  type OptionForAreas,
  type Stretch,
} from "@/lib/data/segments";
import type { Booking, ItineraryDay, ItineraryItem } from "@/lib/types";

/** Where a leg sits relative to today. Drives emphasis, and which leg the
 *  screen opens on. */
export type LegPhase = "past" | "current" | "future";

/**
 * How trustworthy a leg's idea count is as a statement about THAT leg.
 *
 * `area` - the leg's label named towns, or a region, that the bank also knows,
 * so the count is about this leg.
 *
 * `country` - the label matched nothing, so the only honest number is the
 * whole country's. The UI has to say so; presenting Japan's 166 ideas on the
 * four-night Hakone leg as if they were Hakone's would be a lie told in a
 * confident-looking chip.
 */
export type IdeaScope = "area" | "country";

export type LegOverview = {
  /** Stable across renders. Legs repeat by label, so the index is part of it. */
  key: string;
  stretch: Stretch;
  /** Calendar days the leg covers. */
  dayCount: number;
  /** Days carrying at least one live activity or booking. The rest are empty. */
  daysPlanned: number;
  /** Live activities across the leg; cancelled ones are not plan. */
  items: number;
  /** Bookings that START in this leg - where you are when you have to be at
   *  the airport, matching how the bookings tab files them. */
  bookings: number;
  /** True when some booking covers at least one of the leg's nights, which is
   *  the difference between "we have somewhere to sleep" and "we do not". */
  hasStay: boolean;
  /** Undecided options in the bank for this leg. Read with `ideaScope`. */
  ideas: number;
  ideaScope: IdeaScope;
  phase: LegPhase;
};

/**
 * Every leg of the trip, in order, with its counts.
 *
 * `today` is passed in rather than read from the clock so the result is a
 * function of its arguments - the phase of a leg is the only thing here that
 * depends on when you ask.
 */
export function buildLegOverviews(
  days: ItineraryDay[],
  items: ItineraryItem[],
  bookings: Booking[],
  options: OptionForAreas[],
  today: string
): LegOverview[] {
  const stretches = splitIntoStretches(days);
  if (stretches.length === 0) return [];

  // date -> leg index, the join every count below runs through.
  const legOfDate = new Map<string, number>();
  stretches.forEach((stretch, index) => {
    for (const day of stretch.days) legOfDate.set(day.date, index);
  });

  const liveItems = items.filter((item) => item.status !== "cancelled");
  const itemsOfDay = new Map<string, number>();
  for (const item of liveItems) {
    itemsOfDay.set(item.day_id, (itemsOfDay.get(item.day_id) ?? 0) + 1);
  }

  // bookingDates drops cancelled bookings, and that is the intent throughout
  // this module: a cancelled hotel neither fills a day, nor gives the leg a
  // bed, nor counts towards "what is arranged here". The bookings tab still
  // lists it under this leg, because where it WAS is still a fact - but a
  // summary of what is sorted must not count an arrangement that fell through.
  const bookedDates = new Set<string>();
  const bookingsPerLeg = new Array<number>(stretches.length).fill(0);
  for (const booking of bookings) {
    const dates = bookingDates(booking);
    for (const date of dates) bookedDates.add(date);
    // Filed under where it starts. A flight out of Hanoi is Hanoi's.
    const first = dates.find((date) => legOfDate.has(date));
    if (first !== undefined) bookingsPerLeg[legOfDate.get(first)!] += 1;
  }

  return stretches.map((stretch, index) => {
    let daysPlanned = 0;
    let itemCount = 0;
    let hasStay = false;
    for (const day of stretch.days) {
      const onDay = itemsOfDay.get(day.id) ?? 0;
      const booked = bookedDates.has(day.date);
      itemCount += onDay;
      if (booked) hasStay = true;
      if (onDay > 0 || booked) daysPlanned += 1;
    }

    const areas = areaChoicesForStretch(options, stretch);
    const ideas = areas.scoped.reduce((sum, choice) => sum + choice.options, 0);

    return {
      key: `leg-${index}`,
      stretch,
      dayCount: stretch.days.length,
      daysPlanned,
      items: itemCount,
      bookings: bookingsPerLeg[index],
      hasStay,
      ideas,
      ideaScope: areas.rule === "country" ? "country" : "area",
      phase: phaseOf(stretch, today),
    };
  });
}

function phaseOf(stretch: Stretch, today: string): LegPhase {
  if (today < stretch.from) return "future";
  if (today > stretch.to) return "past";
  return "current";
}

/**
 * Which leg the screen should open on: the one you are in, else the next one
 * ahead, else the last one.
 *
 * Opening on the first leg is wrong the moment the trip starts, and opening on
 * nothing makes a collapsed list of fourteen rows look inert. Before the trip
 * begins "the next one" is the first leg, which is also the right answer.
 */
export function initialOpenLeg(legs: LegOverview[]): string | null {
  if (legs.length === 0) return null;
  return (
    legs.find((leg) => leg.phase === "current")?.key ??
    legs.find((leg) => leg.phase === "future")?.key ??
    legs[legs.length - 1].key
  );
}
