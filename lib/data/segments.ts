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
/**
 * All an area choice is computed from.
 *
 * Narrower than PlaceOption on purpose: the itinerary screen wants per-leg
 * idea counts for a bank of ~1000 rows, and pulling every column of every one
 * of them over a phone connection to count them would be absurd. PlaceOption
 * satisfies this, so existing callers are unaffected.
 */
export type OptionForAreas = Pick<
  PlaceOption,
  "country_code" | "area" | "status" | "lat" | "lng"
>;

export function areaChoicesForCountry(
  options: OptionForAreas[],
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

/**
 * Which of a country's areas belong to ONE stretch of it.
 *
 * THE PROBLEM. `areaChoicesForCountry` filters by country and nothing else, so
 * a trip that visits one country twice offers the same list both times. This
 * trip splits Vietnam into "וייטנאם - צפון" (21 days) and "וייטנאם - דרום
 * ומרכז" (35 days), and both were offering all 25 Vietnamese areas - Saigon
 * under the northern leg, Hanoi under the southern one. Nothing in the schema
 * says which town is northern, so the label has to be read.
 *
 * TWO RULES, and neither hardcodes a destination (CLAUDE.md #9):
 *
 *   1. The label NAMES towns that exist in the bank ("קיוטו", "קנאזאווה
 *      וטאקאיאמה"). Those come first, then everything else by distance from
 *      them - a base you sleep in, with day trips around it. Nothing is hidden:
 *      Nara is half an hour from Kyoto and belongs on that list.
 *
 *   2. The label names a DIRECTION ("צפון", "דרום ומרכז"). That is a claim
 *      about a region, so it filters: the country's own geocoded span is cut
 *      into three bands along the relevant axis, and only the named bands are
 *      offered. The rest stay one tap away behind "all towns".
 *
 * Neither matched -> the whole country, exactly as before. A country visited
 * once ("תאילנד", "קמבודיה") is unaffected.
 *
 * AREAS WITH NO COORDINATES ARE ALWAYS OFFERED. A band is evidence about where
 * a place is, and there is none for an ungeocoded area - dropping it would hide
 * a real town on the strength of a missing field.
 */
export type StretchAreas = {
  /** Offer these. Ordered: named towns first, then by whatever the rule sorts by. */
  matched: AreaChoice[];
  /** The rest of the country, hidden behind a toggle. Empty when nothing is hidden. */
  rest: AreaChoice[];
  /**
   * The areas the label actually points at, which is NOT the same as `matched`.
   * Under the towns rule `matched` deliberately carries the whole country, the
   * named towns merely sorted to the front, because Nara belongs on Kyoto's
   * picker. A caller that wants to say "this leg has N ideas waiting" needs the
   * narrower set, and reading it off `matched` would report the country's total
   * against one town.
   *
   * towns  -> the towns the label names.
   * region -> the band the label selects (same as `matched`).
   * country -> everything, because the label scoped nothing. Check `rule`
   *            before calling such a count a property of the leg.
   */
  scoped: AreaChoice[];
  /** Why `matched` is what it is - the UI explains the filter with this. */
  rule: "towns" | "region" | "country";
};

/** Hebrew direction words, and the axis each one cuts. `band` is the index of
 *  the third it selects, low to high along that axis. */
const DIRECTIONS: { word: string; axis: "lat" | "lng"; band: 0 | 1 | 2 }[] = [
  { word: "צפון", axis: "lat", band: 2 },
  { word: "דרום", axis: "lat", band: 0 },
  { word: "מזרח", axis: "lng", band: 2 },
  { word: "מערב", axis: "lng", band: 0 },
  // "מרכז" is the middle of whichever axis its siblings in the label use, and
  // latitude when it stands alone - north/south is how a country this shape
  // gets described.
  { word: "מרכז", axis: "lat", band: 1 },
];

/** Which third of [min, max] a value falls in. Equal-width bands, so the split
 *  follows the country's real extent rather than how many towns sit in each. */
function bandOf(value: number, min: number, max: number): 0 | 1 | 2 {
  if (max <= min) return 1;
  const third = (max - min) / 3;
  if (value < min + third) return 0;
  if (value < min + 2 * third) return 1;
  return 2;
}

export function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function areaChoicesForStretch(
  options: OptionForAreas[],
  stretch: { countryCode: string | null; locationName: string | null }
): StretchAreas {
  const all = areaChoicesForCountry(options, stretch.countryCode);
  const label = (stretch.locationName ?? "").trim();
  if (label === "" || all.length === 0) {
    return { matched: all, rest: [], scoped: all, rule: "country" };
  }

  const haystack = label.toLowerCase();

  // ---- rule 1: the label names towns we know ----
  // Substring both ways: a label may write the town on its own ("קיוטו") or
  // inside a phrase ("קנאזאווה וטאקאיאמה").
  const named = all.filter((choice) => {
    const area = choice.area.trim().toLowerCase();
    return area.length >= 3 && haystack.includes(area);
  });

  if (named.length > 0) {
    const anchors = named.filter((c) => c.lat != null && c.lng != null);
    const distance = (choice: AreaChoice): number => {
      if (choice.lat == null || choice.lng == null || anchors.length === 0) {
        return Number.POSITIVE_INFINITY;
      }
      return Math.min(
        ...anchors.map((a) =>
          haversineKm(a.lat!, a.lng!, choice.lat!, choice.lng!)
        )
      );
    };
    const namedKeys = new Set(named.map((c) => c.area.toLowerCase()));
    const others = all
      .filter((c) => !namedKeys.has(c.area.toLowerCase()))
      // An ungeocoded area sorts last rather than first: infinity is "we do not
      // know", not "very far", and it should not head the list.
      .sort(
        (a, b) =>
          distance(a) - distance(b) ||
          b.options - a.options ||
          a.area.localeCompare(b.area, "he")
      );
    return { matched: [...named, ...others], rest: [], scoped: named, rule: "towns" };
  }

  // ---- rule 2: the label names a region ----
  const wanted = DIRECTIONS.filter((d) => haystack.includes(d.word));
  if (wanted.length === 0)
    return { matched: all, rest: [], scoped: all, rule: "country" };

  // "דרום ומרכז" names two bands on one axis; a label naming both axes is
  // read as an intersection, which is what "צפון מזרח" means.
  const axes = [...new Set(wanted.map((d) => d.axis))];
  const located = all.filter((c) => c.lat != null && c.lng != null);
  if (located.length === 0)
    return { matched: all, rest: [], scoped: all, rule: "country" };

  const inRegion = (choice: AreaChoice): boolean => {
    if (choice.lat == null || choice.lng == null) return true; // no evidence
    return axes.every((axis) => {
      const bands = wanted.filter((d) => d.axis === axis).map((d) => d.band);
      const values = located.map((c) => (axis === "lat" ? c.lat! : c.lng!));
      const value = axis === "lat" ? choice.lat! : choice.lng!;
      return bands.includes(
        bandOf(value, Math.min(...values), Math.max(...values))
      );
    });
  };

  const matched = all.filter(inRegion);
  const rest = all.filter((c) => !inRegion(c));
  // A filter that keeps everything, or nothing, is not telling the family
  // anything - fall back to the plain country list rather than show an empty
  // screen or a pointless toggle.
  if (matched.length === 0 || rest.length === 0) {
    return { matched: all, rest: [], scoped: all, rule: "country" };
  }
  return { matched, rest, scoped: matched, rule: "region" };
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
