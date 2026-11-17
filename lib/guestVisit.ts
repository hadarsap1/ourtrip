// When this guest last opened the home, kept on their own device. It only
// decides what is marked "new since you were here" - a per-viewer convenience:
// in a private window, or the first time, there is simply no such line.

const KEY = "ourtrip.guestHome.lastVisit";

/** Reads the last visit and moves it to now. Call once per open of the home. */
export function takeLastVisit(now: number = Date.now()): number | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    window.localStorage.setItem(KEY, String(now));
    const at = raw ? Number(raw) : NaN;
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

/** How many of these happened after the last visit. No last visit = none. */
export function countSince(stamps: (string | null | undefined)[], lastVisit: number | null): number {
  if (lastVisit === null) return 0;
  let n = 0;
  for (const s of stamps) {
    const at = s ? Date.parse(s) : NaN;
    if (Number.isFinite(at) && at > lastVisit) n++;
  }
  return n;
}

/** "עדכון חדש" for one, "{n} עדכונים חדשים" for more; null for none. */
export function newLabel(n: number, one: string, many: string): string | null {
  if (n <= 0) return null;
  return n === 1 ? one : many.replace("{n}", String(n));
}

/** A quote for the home card, which holds about three handwritten lines: the
 *  newest one short enough to be read whole, else simply the newest. */
export const HOME_QUOTE_MAX = 80;
export function pickQuote<T extends { quote: string }>(newestFirst: T[]): T | null {
  return newestFirst.find((q) => q.quote.length <= HOME_QUOTE_MAX) ?? newestFirst[0] ?? null;
}
