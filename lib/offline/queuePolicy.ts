// Pure rules for the offline write queue (DECISIONS #10: last-write-wins).
// Kept separate from IndexedDB so they are unit tested.

const BASE_MS = 30_000;
const MAX_MS = 60 * 60_000;
export const MAX_ATTEMPTS = 12;

/** Exponential backoff for transient failures: 30s, 1m, 2m … capped at 1h. */
export function nextAttemptDelay(attempts: number): number {
  return Math.min(MAX_MS, BASE_MS * 2 ** Math.max(0, attempts - 1));
}

export function isDue(entry: { nextAttemptAt?: string }, now: Date, force = false): boolean {
  if (force || !entry.nextAttemptAt) return true;
  return new Date(entry.nextAttemptAt).getTime() <= now.getTime();
}

/**
 * Field-level last-write-wins for an offline edit replayed later: apply it
 * only if nobody changed that row on the server after the edit was made on
 * this device. `serverUpdatedAt` is the row's trigger-maintained updated_at.
 * A missing row means it was deleted: the edit is dropped, not resurrected.
 */
export function resolveFieldConflict(
  editedAt: string,
  serverUpdatedAt: string | null
): "apply" | "server-wins" | "row-gone" {
  if (serverUpdatedAt === null) return "row-gone";
  return new Date(serverUpdatedAt).getTime() > new Date(editedAt).getTime() ? "server-wins" : "apply";
}
