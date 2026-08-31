// Derived values the redesigned Today screen leads with. Pure functions, so
// they can be reasoned about (and tested) without a Supabase client or a clock.

import type { ItineraryItem } from "@/lib/types";

export type TripPosition = {
  /** 1-based day number within the trip. */
  day: number;
  /** Total days the trip spans, inclusive of both endpoints. */
  total: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function utcDays(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

/**
 * "יום 12 מתוך 84" — where today falls in the trip. Null when the trip has no
 * date range, or when today is outside it: a day counter that reads "יום ‎-3"
 * before departure or "יום 90 מתוך 84" after landing is worse than no counter.
 */
export function tripPosition(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  today: string
): TripPosition | null {
  if (!startDate || !endDate) return null;
  const start = utcDays(startDate);
  const end = utcDays(endDate);
  const now = utcDays(today);
  if (Number.isNaN(start) || Number.isNaN(end) || Number.isNaN(now)) return null;
  if (end < start) return null;
  if (now < start || now > end) return null;
  return { day: now - start + 1, total: end - start + 1 };
}

export type NextUp = {
  item: ItineraryItem;
  /** Whole minutes from now until the item starts. Never negative. */
  minutesUntil: number;
};

/** "14:30:00" → minutes past midnight, or null when unparseable. */
function minutesOfDay(time: string | null): number | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * The next thing happening today: the earliest item that is still ahead of us
 * and neither done nor cancelled. Items with no start time can't be "next" —
 * there is nothing to count down to — so they are skipped.
 *
 * `nowMinutes` is minutes past local midnight, passed in rather than read from
 * a clock so the caller controls the tick and this stays testable.
 */
export function nextUp(
  items: ItineraryItem[],
  nowMinutes: number
): NextUp | null {
  let best: NextUp | null = null;
  for (const item of items) {
    if (item.status === "done" || item.status === "cancelled") continue;
    const start = minutesOfDay(item.start_time);
    if (start === null || start < nowMinutes) continue;
    const minutesUntil = start - nowMinutes;
    if (!best || minutesUntil < best.minutesUntil) best = { item, minutesUntil };
  }
  return best;
}

/**
 * Which agenda row is "now": the last item whose start time has passed and that
 * isn't finished. Drives the highlighted row in the day list.
 */
export function currentItemId(
  items: ItineraryItem[],
  nowMinutes: number
): string | null {
  let current: { id: string; start: number } | null = null;
  for (const item of items) {
    if (item.status === "done" || item.status === "cancelled") continue;
    const start = minutesOfDay(item.start_time);
    if (start === null || start > nowMinutes) continue;
    if (!current || start > current.start) current = { id: item.id, start };
  }
  return current?.id ?? null;
}

/** Minutes past local midnight for a Date. */
export function minutesNow(now: Date = new Date()): number {
  return now.getHours() * 60 + now.getMinutes();
}
