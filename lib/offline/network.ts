// Small guards for screens that must open offline (CLAUDE.md rule #6).
//
// A phone with "no service" often keeps navigator.onLine === true for a while,
// and a fetch then neither succeeds nor fails - it hangs. Every offline-critical
// read goes through `withTimeout`, so the screen falls back to its device copy
// instead of showing a loader forever.

export class TimeoutError extends Error {
  constructor() {
    super("timeout");
  }
}

export function offlineNow(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
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
