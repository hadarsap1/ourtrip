// Stats & stamps (Phase 2.6): the trip in numbers and a passport stamp per
// country. Pure, so tested. Distances come from the planned places (day
// centroids, great-circle), so they are "km on the plan", labelled as such.

import { countryVisits } from "@/lib/budgetV2";
import { dayCentroids } from "@/lib/mapV2";
import { haversineKm } from "@/supabase/functions/_shared/travel";
import type { ItineraryDay, ItineraryItem } from "@/lib/types";

export type TripStats = {
  countriesVisited: number;
  countriesTotal: number;
  daysDone: number;
  daysTotal: number;
  /** Nights so far per country, in order of first visit. */
  nightsByCountry: { code: string; nights: number }[];
  kmPlanned: number;
  kmSoFar: number;
};

export function tripStats(
  days: Pick<ItineraryDay, "id" | "date" | "country_code">[],
  items: Pick<ItineraryItem, "day_id" | "lat" | "lng" | "status">[],
  today: string
): TripStats {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const done = sorted.filter((d) => d.date <= today);
  const all = new Set(sorted.map((d) => d.country_code).filter(Boolean) as string[]);
  const visited = new Set(done.map((d) => d.country_code).filter(Boolean) as string[]);

  const nights = new Map<string, number>();
  for (const d of done) if (d.country_code) nights.set(d.country_code, (nights.get(d.country_code) ?? 0) + 1);
  const order = countryVisits(done).map((v) => v.code).filter((c, i, arr) => arr.indexOf(c) === i);

  const pts = dayCentroids(sorted, items);
  let kmPlanned = 0;
  let kmSoFar = 0;
  for (let i = 1; i < pts.length; i++) {
    const km = haversineKm(pts[i - 1], pts[i]);
    kmPlanned += km;
    if (pts[i].date <= today) kmSoFar += km;
  }

  return {
    countriesVisited: visited.size,
    countriesTotal: all.size,
    daysDone: done.length,
    daysTotal: sorted.length,
    nightsByCountry: order.map((code) => ({ code, nights: nights.get(code) ?? 0 })),
    kmPlanned: Math.round(kmPlanned),
    kmSoFar: Math.round(kmSoFar),
  };
}

export type Stamp = { code: string; firstDate: string; earned: boolean };

/** One stamp per country in order of first arrival; earned once the family has arrived. */
export function passportStamps(days: Pick<ItineraryDay, "date" | "country_code">[], today: string): Stamp[] {
  const seen = new Map<string, string>();
  for (const d of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    if (d.country_code && !seen.has(d.country_code)) seen.set(d.country_code, d.date);
  }
  return [...seen.entries()].map(([code, firstDate]) => ({ code, firstDate, earned: firstDate <= today }));
}

/** A small, stable tilt per stamp so the page looks stamped, not printed. */
export function stampTilt(code: string): number {
  let h = 0;
  for (const c of code) h = (h * 31 + c.charCodeAt(0)) % 997;
  return (h % 17) - 8; // -8..8 degrees
}
