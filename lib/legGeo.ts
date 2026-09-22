// Where each leg of the trip sits on a map.
//
// WHY THIS IS DERIVED AND NOT STORED. 228 of the trip's 230 days carry no
// coordinates, no itinerary item has any, and there are no map pins or routes
// - so a map drawn from the plan itself would plot two dots. The one part of
// the planning data that IS positioned is the options bank: 371 of its 992
// rows are geocoded, and `areaChoicesForCountry` already reduces those to a
// centre per area. A leg knows which areas are its own, so it can borrow one.
//
// WHY IT IS NOT GEOCODED FROM THE LABEL. Two reasons. The labels are not
// place names - "קנאזאווה וטאקאיאמה" is two towns and "המקטע האחרון - פתוח
// (גאורגיה כברירת מחדל)" is a sentence. And the repo has a scar from exactly
// this: the header of `geocode-places` records 83 options landing on 8 country
// centroids because a geocoder answered confidently about names it did not
// know, producing "a map that looked populated and was wrong". Deriving from
// places the family themselves saved cannot invent a location that nobody
// entered.
//
// EVERY POINT SAYS HOW SURE IT IS. A leg whose label names towns the bank
// knows gets that town, and is precise. A leg whose label matched nothing gets
// the middle of its country and is marked approximate. A leg whose country has
// nothing geocoded gets no point at all and is listed as missing, rather than
// dropped onto a plausible-looking spot.

import {
  areaChoicesForCountry,
  areaChoicesForStretch,
  type AreaChoice,
  type OptionForAreas,
} from "@/lib/data/segments";
import type { ItineraryDay } from "@/lib/types";

export type LegPointPrecision =
  /** The family placed this leg themselves; it is on the day rows. */
  | "saved"
  /** Sits on a town the leg's own label names. */
  | "area"
  /** Somewhere in the right country, and nothing finer is known. */
  | "country";

export type LegPoint = {
  lat: number;
  lng: number;
  precision: LegPointPrecision;
  /** The town the point sits on, when it sits on one. Null for a country
   *  centroid, which is deliberately nowhere in particular. */
  anchorArea: string | null;
};

/**
 * A map point for one leg, or null when nothing in the bank can place it.
 *
 * A precise point is the busiest of the leg's own areas rather than an average
 * of them: a mean of Hanoi, Sapa and Cat Ba is a paddy field, while Hanoi is
 * somewhere you can actually recognise from above. A country point IS a mean,
 * for the opposite reason - it must not look like a claim about one town.
 */
export function legPoint(
  stretch: {
    countryCode: string | null;
    locationName: string | null;
    days?: Pick<ItineraryDay, "lat" | "lng">[];
  },
  options: OptionForAreas[]
): LegPoint | null {
  // A coordinate already on the days wins over anything derived here. It got
  // there either from the segments planner or because someone pinned this leg
  // by hand, and in both cases it is an answer rather than an inference.
  const placed = stretch.days?.find((day) => day.lat != null && day.lng != null);
  if (placed) {
    return {
      lat: placed.lat!,
      lng: placed.lng!,
      precision: "saved",
      anchorArea: stretch.locationName,
    };
  }

  // No country is a gap in the day's data, not a location. areaChoicesForCountry
  // treats a null code as "do not filter", so without this guard such a leg
  // would be placed at the average of all six countries - a point in the sea
  // that looks as confident as any other.
  if (!stretch.countryCode) return null;

  const areas = areaChoicesForStretch(options, stretch);

  if (areas.rule !== "country") {
    const anchor = busiestLocated(areas.scoped);
    if (anchor) {
      return {
        lat: anchor.lat!,
        lng: anchor.lng!,
        precision: "area",
        anchorArea: anchor.area,
      };
    }
  }

  // Either the label scoped nothing, or the areas it scoped are all
  // ungeocoded. Both mean the same thing on a map: the country, and no more.
  const located = areaChoicesForCountry(options, stretch.countryCode).filter(
    (choice) => choice.lat != null && choice.lng != null
  );
  if (located.length === 0) return null;

  return {
    lat: mean(located.map((c) => c.lat!)),
    lng: mean(located.map((c) => c.lng!)),
    precision: "country",
    anchorArea: null,
  };
}

/** The area with the most ideas that also has coordinates. `scoped` is already
 *  sorted by count, but the busiest one is often the one nobody geocoded. */
function busiestLocated(choices: AreaChoice[]): AreaChoice | null {
  let best: AreaChoice | null = null;
  for (const choice of choices) {
    if (choice.lat == null || choice.lng == null) continue;
    if (!best || choice.options > best.options) best = choice;
  }
  return best;
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** The box that holds every point, for fitting the map to the trip. Null when
 *  there is nothing to fit. */
export function boundsOfPoints(
  points: { lat: number; lng: number }[]
): { north: number; south: number; east: number; west: number } | null {
  if (points.length === 0) return null;
  return {
    north: Math.max(...points.map((p) => p.lat)),
    south: Math.min(...points.map((p) => p.lat)),
    east: Math.max(...points.map((p) => p.lng)),
    west: Math.min(...points.map((p) => p.lng)),
  };
}
