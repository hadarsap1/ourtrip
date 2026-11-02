// Stats & stamps (Phase 2.6): the trip in numbers and a passport stamp per
// country. Pure, so tested. Km walked come from the parents' steps
// (lib/stepsView.ts), not from here.

import { countryVisits } from "@/lib/budgetV2";
import type { ItineraryDay } from "@/lib/types";

export type TripStats = {
  countriesVisited: number;
  countriesTotal: number;
  daysDone: number;
  daysTotal: number;
  /** Nights so far per country, in order of first visit. */
  nightsByCountry: { code: string; nights: number }[];
};

export function tripStats(
  days: Pick<ItineraryDay, "id" | "date" | "country_code">[],
  today: string
): TripStats {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const done = sorted.filter((d) => d.date <= today);
  const all = new Set(sorted.map((d) => d.country_code).filter(Boolean) as string[]);
  const visited = new Set(done.map((d) => d.country_code).filter(Boolean) as string[]);

  const nights = new Map<string, number>();
  for (const d of done) if (d.country_code) nights.set(d.country_code, (nights.get(d.country_code) ?? 0) + 1);
  const order = countryVisits(done).map((v) => v.code).filter((c, i, arr) => arr.indexOf(c) === i);

  return {
    countriesVisited: visited.size,
    countriesTotal: all.size,
    daysDone: done.length,
    daysTotal: sorted.length,
    nightsByCountry: order.map((code) => ({ code, nights: nights.get(code) ?? 0 })),
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
