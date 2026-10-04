// Global offline status (F10): online/offline, last successful sync, and how
// many writes wait in the pending queue. A tiny external store read with
// useSyncExternalStore (see useOfflineStatus), so any screen can show it
// without a context provider around the tree.

import { getOfflineDB } from "./db";

export type OfflineStatus = {
  online: boolean;
  /** ISO time of the last successful sync on this device, or null. */
  lastSyncAt: string | null;
  pending: number;
};

const LAST_SYNC_KEY = "ourtrip-last-sync";
const SERVER_SNAPSHOT: OfflineStatus = { online: true, lastSyncAt: null, pending: 0 };

let snapshot: OfflineStatus = SERVER_SNAPSHOT;
let started = false;
const listeners = new Set<() => void>();

function emit(next: Partial<OfflineStatus>) {
  const merged = { ...snapshot, ...next };
  if (merged.online === snapshot.online && merged.lastSyncAt === snapshot.lastSyncAt && merged.pending === snapshot.pending) return;
  snapshot = merged;
  listeners.forEach((l) => l());
}

function readLastSync(): string | null {
  try {
    return window.localStorage.getItem(LAST_SYNC_KEY);
  } catch {
    return null;
  }
}

/** Re-counts the pending-writes queue. Call after enqueueing or replaying. */
export async function refreshPendingCount(): Promise<void> {
  const dbp = getOfflineDB();
  if (!dbp) return;
  try {
    emit({ pending: await (await dbp).count("pending_writes") });
  } catch {
    // IndexedDB blocked: leave the last known count
  }
}

/** Records a successful round-trip with the server. */
export function markSynced(at: Date = new Date()): void {
  const iso = at.toISOString();
  try {
    window.localStorage.setItem(LAST_SYNC_KEY, iso);
  } catch {
    // storage blocked: the indicator still updates for this session
  }
  emit({ lastSyncAt: iso });
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  snapshot = { online: navigator.onLine, lastSyncAt: readLastSync(), pending: 0 };
  const onNet = () => emit({ online: navigator.onLine });
  window.addEventListener("online", onNet);
  window.addEventListener("offline", onNet);
  void refreshPendingCount();
}

export function subscribeOfflineStatus(cb: () => void): () => void {
  start();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getOfflineStatus(): OfflineStatus {
  start();
  return snapshot;
}

export function getServerOfflineStatus(): OfflineStatus {
  return SERVER_SNAPSHOT;
}

/**
 * Hebrew relative time for "סונכרן לאחרונה ...". Pure, so it is unit tested;
 * `now` is injectable for the same reason.
 */
export function formatLastSynced(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const then = new Date(iso);
  const mins = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (Number.isNaN(mins)) return null;
  if (mins < 1) return "לפני רגע";
  if (mins === 1) return "לפני דקה";
  if (mins < 60) return `לפני ${mins} דקות`;
  const hours = Math.floor(mins / 60);
  if (hours === 1) return "לפני שעה";
  if (hours === 2) return "לפני שעתיים";
  if (hours < 24 && then.getDate() === now.getDate()) return `לפני ${hours} שעות`;
  const hh = String(then.getHours()).padStart(2, "0");
  const mm = String(then.getMinutes()).padStart(2, "0");
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (then.toDateString() === yesterday.toDateString()) return `אתמול ב-${hh}:${mm}`;
  if (hours < 24) return `לפני ${hours} שעות`;
  const dd = String(then.getDate()).padStart(2, "0");
  const mo = String(then.getMonth() + 1).padStart(2, "0");
  return `ב-${dd}/${mo}`;
}
