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
  haversineKm,
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
/**
 * How far a coordinate saved on a day may sit from the nearest place the leg is
 * actually about before it stops being believable.
 *
 * The honest cases land at nearly zero: `applyLegPlan` writes an area's own
 * centre onto the days, and a hand-picked town is at most a few tens of km off
 * the bank's centre for that same area. 300km is far past either and still
 * rejects what this trip actually had on it.
 */
const SAVED_TRUST_KM = 300;

export function legPoint(
  stretch: {
    countryCode: string | null;
    locationName: string | null;
    days?: Pick<ItineraryDay, "lat" | "lng">[];
  },
  options: OptionForAreas[]
): LegPoint | null {
  const saved = stretch.days?.find((day) => day.lat != null && day.lng != null);

  // No country is a gap in the day's data, not a location. areaChoicesForCountry
  // treats a null code as "do not filter", so without this guard such a leg
  // would be placed at the average of all six countries - a point in the sea
  // that looks as confident as any other. A saved coordinate is then the only
  // thing there is, and nothing exists to check it against.
  if (!stretch.countryCode) {
    return saved
      ? {
          lat: saved.lat!,
          lng: saved.lng!,
          precision: "saved",
          anchorArea: stretch.locationName,
        }
      : null;
  }

  const areas = areaChoicesForStretch(options, stretch);
  const scopedLocated = areas.scoped.filter(
    (choice) => choice.lat != null && choice.lng != null
  );

  // A coordinate already on the days outranks anything derived here - BUT ONLY
  // IF IT IS ABOUT THIS LEG.
  //
  // The first version trusted it outright, on the assumption that it got there
  // from the segments planner or from someone pinning the leg by hand. That
  // assumption was wrong. This trip's first two days carried 14.058/108.277 -
  // the geographic centre of Vietnam, 780km south of Hanoi - left behind by the
  // geocoder failure `geocode-places` documents in its own header, where an API
  // answered with a country centroid for a name it did not know. So the leg
  // that starts in Hanoi drew its pin in the central highlands and, because the
  // saved branch named itself after the leg's label, called it "וייטנאם - צפון"
  // and hid what had happened.
  //
  // The check is the leg's own areas: a real saved point is one of them, or
  // within a short drive of one. 729km from the nearest is not a location
  // anybody chose, and the derived answer is better than it.
  if (saved) {
    const reference = scopedLocated.length > 0
      ? scopedLocated
      : areaChoicesForCountry(options, stretch.countryCode).filter(
          (choice) => choice.lat != null && choice.lng != null
        );
    const near = nearestTo(saved.lat!, saved.lng!, reference);
    // Nothing geocoded to check against means no grounds to doubt it.
    if (!near || near.km <= SAVED_TRUST_KM) {
      return {
        lat: saved.lat!,
        lng: saved.lng!,
        precision: "saved",
        // Named by the town it is nearest, not by the leg's label. A pin that
        // names a region can be wrong without looking wrong.
        anchorArea: near ? near.choice.area : stretch.locationName,
      };
    }
  }

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

/** The closest of `choices` to a point, with the distance. Null when there is
 *  nothing located to compare against. */
function nearestTo(
  lat: number,
  lng: number,
  choices: AreaChoice[]
): { choice: AreaChoice; km: number } | null {
  let best: { choice: AreaChoice; km: number } | null = null;
  for (const choice of choices) {
    if (choice.lat == null || choice.lng == null) continue;
    const km = haversineKm(lat, lng, choice.lat, choice.lng);
    if (!best || km < best.km) best = { choice, km };
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
