// Quiet record of render crashes (app/error.tsx, app/global-error.tsx), kept
// in IndexedDB on this device only. Nothing here is ever sent: the point is to
// find a crash that happened on the road with no network, by reading it later
// on the phone itself (settings, parents only). Never throws - a failing log
// must not turn one crash into two.

import { getOfflineDB, type ErrorLogEntry } from "./db";

/** Kept newest first; older entries are dropped past this. */
export const ERROR_LOG_MAX = 30;
const STACK_LINES = 8;
const MESSAGE_MAX = 500;

export function toLogEntry(
  error: Error & { digest?: string },
  boundary: ErrorLogEntry["boundary"],
  at = new Date()
): ErrorLogEntry {
  const path = typeof window === "undefined" ? "" : window.location.pathname;
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  const stack = error.stack ? error.stack.split("\n").slice(0, STACK_LINES).join("\n") : null;
  return {
    at: at.toISOString(),
    path,
    message: String(error.message ?? error).slice(0, MESSAGE_MAX),
    digest: error.digest ?? null,
    stack,
    online,
    boundary,
  };
}

export async function logRenderError(
  error: Error & { digest?: string },
  boundary: ErrorLogEntry["boundary"]
): Promise<void> {
  try {
    const dbp = getOfflineDB();
    if (!dbp) return;
    const db = await dbp;
    await db.add("error_log", toLogEntry(error, boundary));
    const keys = await db.getAllKeys("error_log");
    const extra = keys.length - ERROR_LOG_MAX;
    // keys come back ascending: the oldest go first
    for (let i = 0; i < extra; i++) await db.delete("error_log", keys[i]);
  } catch {
    // quota, private mode, or the database itself is what broke
  }
}

export async function readErrorLog(): Promise<ErrorLogEntry[]> {
  try {
    const dbp = getOfflineDB();
    if (!dbp) return [];
    const rows = await (await dbp).getAll("error_log");
    return rows.reverse();
  } catch {
    return [];
  }
}

export async function clearErrorLog(): Promise<void> {
  try {
    const dbp = getOfflineDB();
    if (!dbp) return;
    await (await dbp).clear("error_log");
  } catch {
    // nothing to clear
  }
}

/** Plain text for "copy", to paste into a message to whoever fixes it. */
export function formatErrorLog(entries: ErrorLogEntry[]): string {
  return entries
    .map((e) =>
      [`${e.at} ${e.boundary} ${e.path}${e.online ? "" : " (offline)"}`, e.message, e.digest ? `digest ${e.digest}` : null, e.stack]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");
}
