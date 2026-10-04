// Plan-my-day (Phase 2.2): 3-4 stops for an empty day from the ideas bank.
// Rule-based and deterministic, so it works offline and needs no AI:
//   1. pool = undecided options in the day's country and chosen area, minus
//      categories that are not a day's activity (hotels, transport, towns);
//   2. rainy mode drops outdoor categories;
//   3. pick 2-3 sights + 1 restaurant, shortlisted first, rotated by `seed`;
//   4. order sights by nearest neighbour, lunch after the first sight;
//   5. times from 09:30 with fixed visit lengths + estimated travel.
// Nothing here knows opening hours (the bank has none) - ❌ in the report.

import { haversineKm, travelMinutes, type LatLng } from "@/supabase/functions/_shared/travel";
import type { PlaceOption } from "@/lib/types";

export type PlanCandidate = Pick<PlaceOption, "id" | "title" | "category" | "area" | "lat" | "lng" | "status" | "country_code">;

export const SIGHT_CATEGORIES = ["attraction", "activity", "nature"] as const;
export const OUTDOOR_CATEGORIES = new Set(["activity", "nature"]);
const MEAL = "restaurant";
const EXTRA = "shop";

const VISIT_MIN: Record<string, number> = { attraction: 120, activity: 150, nature: 150, restaurant: 75, shop: 60 };
const DAY_START = 9 * 60 + 30;

export type PlanStop = {
  option: PlanCandidate;
  /** Minutes past midnight. */
  start: number;
  /** Estimated minutes from the previous stop; null for the first stop or when either end has no place. */
  travelFromPrev: number | null;
};

const at = (o: PlanCandidate): LatLng | null => (o.lat != null && o.lng != null ? { lat: o.lat, lng: o.lng } : null);
const isSight = (o: PlanCandidate) => (SIGHT_CATEGORIES as readonly string[]).includes(o.category ?? "");

/** Areas in this country that have something to plan, biggest first; the day's own area first. */
export function planAreas(options: PlanCandidate[], countryCode: string | null, dayArea: string | null): { area: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const o of eligible(options, countryCode, false)) {
    const a = (o.area ?? "").trim();
    if (a) counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  const own = (dayArea ?? "").trim().toLowerCase();
  return [...counts.entries()]
    .map(([area, count]) => ({ area, count }))
    .sort((a, b) => {
      const am = a.area.toLowerCase() === own;
      const bm = b.area.toLowerCase() === own;
      if (am !== bm) return am ? -1 : 1;
      return b.count - a.count || a.area.localeCompare(b.area, "he");
    });
}

function eligible(options: PlanCandidate[], countryCode: string | null, rainy: boolean): PlanCandidate[] {
  return options.filter(
    (o) =>
      (o.status === "option" || o.status === "shortlist") &&
      (!countryCode || o.country_code === countryCode) &&
      (isSight(o) || o.category === MEAL || o.category === EXTRA) &&
      !(rainy && OUTDOOR_CATEGORIES.has(o.category ?? ""))
  );
}

/** Shortlisted first, then located, then by title - a stable base order that `seed` rotates. */
function ranked(list: PlanCandidate[]): PlanCandidate[] {
  return [...list].sort(
    (a, b) =>
      Number(b.status === "shortlist") - Number(a.status === "shortlist") ||
      Number(at(b) !== null) - Number(at(a) !== null) ||
      a.title.localeCompare(b.title, "he")
  );
}

function rotate<T>(list: T[], seed: number): T[] {
  if (list.length === 0) return list;
  const k = ((seed % list.length) + list.length) % list.length;
  return [...list.slice(k), ...list.slice(0, k)];
}

/** Greedy nearest-neighbour from the first item; unplaceable items keep their order at the end. */
export function nearestNeighbourOrder<T extends { lat: number | null; lng: number | null }>(items: T[]): T[] {
  const placed = items.filter((i) => i.lat != null && i.lng != null);
  const rest = items.filter((i) => i.lat == null || i.lng == null);
  if (placed.length <= 2) return [...placed, ...rest];
  const out = [placed[0]];
  const left = placed.slice(1);
  while (left.length) {
    const cur = out[out.length - 1] as T & LatLng;
    let best = 0;
    for (let i = 1; i < left.length; i++) {
      if (haversineKm(cur, left[i] as T & LatLng) < haversineKm(cur, left[best] as T & LatLng)) best = i;
    }
    out.push(left.splice(best, 1)[0]);
  }
  return [...out, ...rest];
}

function nearestTo(anchor: PlanCandidate | undefined, list: PlanCandidate[]): PlanCandidate | undefined {
  const a = anchor ? at(anchor) : null;
  if (!a) return list[0];
  const located = list.filter((o) => at(o));
  if (located.length === 0) return list[0];
  return located.reduce((best, o) => (haversineKm(a, at(o)!) < haversineKm(a, at(best)!) ? o : best));
}

export type PlanInput = {
  options: PlanCandidate[];
  countryCode: string | null;
  area: string | null;
  rainy?: boolean;
  seed?: number;
  /** Options to leave out (e.g. one the family just swapped away). */
  exclude?: Set<string>;
};

/** Builds the day. Returns [] when the area has nothing to offer. */
export function planDay({ options, countryCode, area, rainy = false, seed = 0, exclude }: PlanInput): PlanStop[] {
  const inArea = eligible(options, countryCode, rainy).filter(
    (o) => !exclude?.has(o.id) && (!area || (o.area ?? "").trim().toLowerCase() === area.trim().toLowerCase())
  );
  const sights = rotate(ranked(inArea.filter(isSight)), seed);
  const meals = ranked(inArea.filter((o) => o.category === MEAL));
  const extras = rotate(ranked(inArea.filter((o) => o.category === EXTRA)), seed);

  // Two sights is a full day with kids; a third only when there is no shop.
  const pickedSights = nearestNeighbourOrder(sights.slice(0, extras.length ? 2 : 3));
  const lunch = nearestTo(pickedSights[0], rotate(meals, seed));
  const extra = extras[0];

  const stops: PlanCandidate[] = [];
  if (pickedSights[0]) stops.push(pickedSights[0]);
  if (lunch) stops.push(lunch);
  stops.push(...pickedSights.slice(1));
  if (extra && stops.length < 4) stops.push(extra);
  return schedule(stops);
}

/** Times and travel chips for an ordered list of stops. */
export function schedule(stops: PlanCandidate[]): PlanStop[] {
  let clock = DAY_START;
  return stops.map((option, i) => {
    const prev = stops[i - 1];
    const a = prev ? at(prev) : null;
    const b = at(option);
    const travel = a && b ? travelMinutes(a, b) : null;
    if (i > 0) clock += travel ?? 20;
    const stop = { option, start: clock, travelFromPrev: i === 0 ? null : travel };
    clock += VISIT_MIN[option.category ?? ""] ?? 90;
    return stop;
  });
}

/** Replaces one stop with the best unused candidate of the same kind, keeping the rest. */
export function swapStop(plan: PlanStop[], index: number, input: PlanInput): PlanStop[] {
  const used = new Set(plan.map((s) => s.option.id));
  const target = plan[index]?.option;
  if (!target) return plan;
  const sameKind = (o: PlanCandidate) => (isSight(target) ? isSight(o) : o.category === target.category);
  const pool = eligible(input.options, input.countryCode, input.rainy ?? false).filter(
    (o) =>
      sameKind(o) &&
      !used.has(o.id) &&
      !input.exclude?.has(o.id) &&
      (!input.area || (o.area ?? "").trim().toLowerCase() === input.area.trim().toLowerCase())
  );
  const neighbour = plan[index - 1]?.option ?? plan[index + 1]?.option;
  const next = nearestTo(neighbour, ranked(pool));
  if (!next) return plan;
  const stops = plan.map((s) => s.option);
  stops[index] = next;
  return schedule(stops);
}

/** "HH:MM:00" for an itinerary item. */
export function toTime(minutes: number): string {
  const m = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;
}
