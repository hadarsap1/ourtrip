// Small guards for screens that must open offline (CLAUDE.md rule #6).
//
// A phone with "no service" often keeps navigator.onLine === true for a while,
// and a fetch then neither succeeds nor fails - it hangs. Every request is
// time-limited (lib/supabase.ts guardedFetch), and once one times out the line
// is treated as dead for DEAD_LINE_MS: screens that make several calls in a
// row then fall back to their device copy after ONE wait, not one per call.

export class TimeoutError extends Error {
  constructor() {
    super("timeout");
    this.name = "TimeoutError";
  }
}

export const DEAD_LINE_MS = 30_000;
let unreachableUntil = 0;

/** A request timed out: answer "offline" at once for the next DEAD_LINE_MS. */
export function markUnreachable(now = Date.now()): void {
  unreachableUntil = now + DEAD_LINE_MS;
}

/** A response arrived (or the phone reports it is back online). */
export function markReachable(): void {
  unreachableUntil = 0;
}

if (typeof window !== "undefined") window.addEventListener("online", markReachable);

export function offlineNow(now = Date.now()): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return now < unreachableUntil;
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new TimeoutError()), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
