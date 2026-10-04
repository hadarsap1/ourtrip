// Trip overview (Phase 2.5): the trip as a metro line - one station per stay,
// the track coloured by country, a country "interchange" where it changes.
// Pure, so tested.

import { countryHex } from "@/lib/mapV2";

export type MetroLeg = {
  key: string;
  label: string;
  countryCode: string | null;
  from: string;
  to: string;
  nights: number;
  phase: "past" | "current" | "future";
};

export type MetroStop = MetroLeg & {
  color: string;
  /** First stop in a new country (draw a flag + interchange ring). */
  newCountry: boolean;
  /** Colour of the track leading OUT of this stop (the next stop's country), null on the last. */
  trackOut: string | null;
};

export function metroStops(legs: MetroLeg[]): MetroStop[] {
  return legs.map((leg, i) => ({
    ...leg,
    color: countryHex(leg.countryCode),
    newCountry: i === 0 || legs[i - 1].countryCode !== leg.countryCode,
    trackOut: i < legs.length - 1 ? countryHex(legs[i + 1].countryCode) : null,
  }));
}

/** Index to scroll into view first: the current stop, else the next future one, else the last. */
export function focusIndex(legs: Pick<MetroLeg, "phase">[]): number {
  const cur = legs.findIndex((l) => l.phase === "current");
  if (cur >= 0) return cur;
  const next = legs.findIndex((l) => l.phase === "future");
  return next >= 0 ? next : Math.max(0, legs.length - 1);
}
