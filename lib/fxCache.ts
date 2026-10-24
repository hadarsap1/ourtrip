// Offline exchange rates (Phase 2.4). Every rate the app resolves is kept on
// the device with the day it was for, so an expense entered in airplane mode
// still converts - with the last known rate and a visible "updated" stamp.
// localStorage: a few currencies × a number each, read synchronously.

const KEY = "ourtrip-fx";

export type FxStore = { rates: Record<string, { rate: number; day: string }>; updatedAt: string | null };

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readFxStore(s: Storage | null = storage()): FxStore {
  try {
    const raw = s?.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as FxStore) : null;
    if (parsed && typeof parsed.rates === "object") return parsed;
  } catch {
    // corrupt or blocked - start empty
  }
  return { rates: {}, updatedAt: null };
}

/** Keeps the newest rate per currency; never replaces a newer day with an older one. */
export function saveFxRate(currency: string, rate: number, day: string, now = new Date(), s: Storage | null = storage()): void {
  if (!(rate > 0) || currency === "ILS") return;
  const store = readFxStore(s);
  const prev = store.rates[currency];
  if (prev && prev.day > day) return;
  store.rates[currency] = { rate, day };
  store.updatedAt = now.toISOString();
  try {
    s?.setItem(KEY, JSON.stringify(store));
  } catch {
    // quota or private mode - the rate still works for this session
  }
}

export function cachedFxRate(currency: string, s: Storage | null = storage()): { rate: number; day: string } | null {
  if (currency === "ILS") return { rate: 1, day: "" };
  return readFxStore(s).rates[currency] ?? null;
}
