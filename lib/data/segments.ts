// Splitting a country's block of days into the towns the family is actually in.
//
// THE PROBLEM THIS SOLVES. The bank holds 553 places tagged with a real area -
// הוי אן 41, האנוי 33, צ'אנג מאי 27 - and the itinerary holds 227 days tagged
// with a country-sized label: 38 days all called "תאילנד", 28 all called
// "קמבודיה", 35 called "וייטנאם - דרום ומרכז". Nothing joins the two. No day
// carries coordinates either (checked live 2026-09-05, all 227 rows), so
// `rankForDay` has neither an area match nor a distance to sort by, and
// `tallyByArea` reports 0 days for every area that has options.
//
// The missing decision is not "which place on which day" - it is "which town on
// which dates". That is a route, and it is the one thing a person has to say
// out loud before anything downstream can work: the picker's ranking, the
// per-area tallies, per-day weather, the home timeline, and the destination
// facts all key off `itinerary_days.location_name`.
//
// HOW IT IS EXPRESSED. Not with date pickers. People plan a country as an
// ordered list with nights against each stop - "האנוי 4, סאפה 3, טאם קוק 2" -
// and that shape cannot produce a gap or an overlap, which a pair of date
// pickers per leg can and will. So the input is an ordered list of
// (area, days), and the dates are derived by walking the stretch.

import { chunkDayIds } from "@/lib/data/itinerary";
import { getSupabase } from "@/lib/supabase";
import type { ItineraryDay, PlaceOption } from "@/lib/types";

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

/** A run of consecutive days already sharing one country and one label. */
export type Stretch = {
  countryCode: string | null;
  locationName: string | null;
  /** In date order. Never empty. */
  days: ItineraryDay[];
  from: string;
  to: string;
};

/**
 * The trip as the stretches it currently reads as.
 *
 * Breaks on a change of country or of label, not on a gap in the dates: a
 * missing day in the middle of Hoi An is a hole in the data, not a new place,
 * and splitting there would offer the family two Hoi Ans to plan separately.
 */
export function splitIntoStretches(days: ItineraryDay[]): Stretch[] {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const out: Stretch[] = [];

  for (const day of sorted) {
    const last = out[out.length - 1];
    if (
      last &&
      last.countryCode === day.country_code &&
      last.locationName === day.location_name
    ) {
      last.days.push(day);
      last.to = day.date;
      continue;
    }
    out.push({
      countryCode: day.country_code,
      locationName: day.location_name,
      days: [day],
      from: day.date,
      to: day.date,
    });
  }
  return out;
}

export type AreaChoice = {
  area: string;
  /** Undecided options in the bank for this area - the reason to give it days. */
  options: number;
  /** Mean of the area's geocoded options, so the assigned days get a position
   *  and weather/distance stop being blank. Null when none are geocoded. */
  lat: number | null;
  lng: number | null;
};

/**
 * The areas worth offering for one country, richest first.
 *
 * Only 'option' and 'shortlist' count: an area whose places are all planned or
 * rejected has nothing left to decide, and listing it is noise. Options with no
 * area at all are skipped rather than bucketed - "(no area)" is not somewhere
 * you can spend four nights.
 */
export function areaChoicesForCountry(
  options: PlaceOption[],
  countryCode: string | null
): AreaChoice[] {
  const buckets = new Map<
    string,
    { area: string; options: number; latSum: number; lngSum: number; located: number }
  >();

  for (const option of options) {
    if (countryCode && option.country_code !== countryCode) continue;
    if (option.status !== "option" && option.status !== "shortlist") continue;
    const area = (option.area ?? "").trim();
    if (area === "") continue;

    // Case- and spacing-insensitive, so "הואה הין" does not split in two.
    const key = area.toLowerCase();
    const bucket = buckets.get(key) ?? {
      area,
      options: 0,
      latSum: 0,
      lngSum: 0,
      located: 0,
    };
    bucket.options += 1;
    if (option.lat != null && option.lng != null) {
      bucket.latSum += option.lat;
      bucket.lngSum += option.lng;
      bucket.located += 1;
    }
    buckets.set(key, bucket);
  }

  return [...buckets.values()]
    .map((b) => ({
      area: b.area,
      options: b.options,
      lat: b.located > 0 ? b.latSum / b.located : null,
      lng: b.located > 0 ? b.lngSum / b.located : null,
    }))
    .sort((a, b) => b.options - a.options || a.area.localeCompare(b.area, "he"));
}

/** One stop on the route: an area, and how many days it gets. */
export type Leg = {
  area: string;
  days: number;
  lat: number | null;
  lng: number | null;
};

export type DayAssignment = {
  day: ItineraryDay;
  locationName: string;
  lat: number | null;
  lng: number | null;
};

export type LegPlan = {
  assignments: DayAssignment[];
  /** Days at the end of the stretch that no leg claimed. They keep whatever
   *  label they had; an unfinished route must not silently blank days. */
  leftover: ItineraryDay[];
};

/**
 * Walks the stretch handing out its days to the legs, in order.
 *
 * Legs asking for zero days are ignored rather than treated as an error - a
 * stepper resting at 0 is how you say "not this trip", and it is the normal
 * state of most rows in the list.
 */
export function planLegs(stretch: Stretch, legs: Leg[]): LegPlan {
  const assignments: DayAssignment[] = [];
  let cursor = 0;

  for (const leg of legs) {
    const want = Math.max(0, Math.floor(leg.days));
    for (let i = 0; i < want && cursor < stretch.days.length; i++, cursor++) {
      assignments.push({
        day: stretch.days[cursor],
        locationName: leg.area,
        lat: leg.lat,
        lng: leg.lng,
      });
    }
  }

  return { assignments, leftover: stretch.days.slice(cursor) };
}

/** Total days the legs are asking for, however many the stretch has. */
export function totalLegDays(legs: Leg[]): number {
  return legs.reduce((sum, leg) => sum + Math.max(0, Math.floor(leg.days)), 0);
}

/** Moves a leg one place earlier or later. Returns a new array; a move off
 *  either end is a no-op, so the caller can wire both buttons unconditionally. */
export function moveLeg(legs: Leg[], index: number, delta: number): Leg[] {
  const target = index + delta;
  if (index < 0 || index >= legs.length || target < 0 || target >= legs.length) {
    return legs;
  }
  const next = [...legs];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * Writes the plan to the days.
 *
 * One request per leg rather than per day: a 53-day stretch would otherwise be
 * 53 round trips over a hotel connection. Grouping by the value being written
 * means each request is an `in(id, …)` over that leg's days, chunked by
 * chunkDayIds for the same URL-length reason as everywhere else.
 */
export async function applyLegPlan(plan: LegPlan): Promise<number> {
  const client = requireClient();

  const groups = new Map<string, { assignment: DayAssignment; ids: string[] }>();
  for (const assignment of plan.assignments) {
    const key = `${assignment.locationName}::${assignment.lat}::${assignment.lng}`;
    const group = groups.get(key) ?? { assignment, ids: [] };
    group.ids.push(assignment.day.id);
    groups.set(key, group);
  }

  let written = 0;
  for (const group of groups.values()) {
    for (const batch of chunkDayIds(group.ids)) {
      const { error } = await client
        .from("itinerary_days")
        .update({
          location_name: group.assignment.locationName,
          lat: group.assignment.lat,
          lng: group.assignment.lng,
        })
        .in("id", batch);
      if (error) throw new Error(error.message);
      written += batch.length;
    }
  }
  return written;
}
