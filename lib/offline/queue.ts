// Pending-writes queue: writes made offline are stored here and replayed in
// order on reconnect (last-write-wins conflict policy, DECISIONS #10).
//
// v2 (Phase 1, F10): expenses, journal entries and day notes; transient
// failures back off (30s → 1h) instead of hammering a flaky connection;
// permanent failures move to `failed_writes` instead of being deleted, so the
// family can see and re-enter them. Day notes are field edits and replay with
// field-level last-write-wins against the row's updated_at.

import {
  getOfflineDB,
  type DayNotePayload,
  type ExpensePayload,
  type JournalPayload,
  type PendingWrite,
} from "./db";
import { isDue, MAX_ATTEMPTS, nextAttemptDelay, resolveFieldConflict } from "./queuePolicy";

async function enqueue(write: PendingWrite): Promise<void> {
  const dbp = getOfflineDB();
  if (!dbp) throw new Error("indexeddb unavailable");
  await (await dbp).add("pending_writes", write);
  const { refreshPendingCount } = await import("./status");
  await refreshPendingCount();
}

export function enqueueExpense(payload: ExpensePayload): Promise<void> {
  return enqueue({ kind: "expense", payload, createdAt: new Date().toISOString() });
}

export function enqueueJournal(payload: JournalPayload): Promise<void> {
  return enqueue({ kind: "journal", payload, createdAt: new Date().toISOString() });
}

export function enqueueDayNote(payload: DayNotePayload): Promise<void> {
  return enqueue({ kind: "note", payload, createdAt: new Date().toISOString() });
}

export type ReplayResult = { replayed: number; dropped: number; conflicts: number };

async function apply(entry: PendingWrite): Promise<"done" | "conflict"> {
  switch (entry.kind) {
    case "expense": {
      // dynamic import breaks the module cycle (expenses → queue → expenses)
      const { createExpense } = await import("@/lib/data/expenses");
      await createExpense(entry.payload);
      return "done";
    }
    case "journal": {
      const { createJournalEntry } = await import("@/lib/data/journal");
      await createJournalEntry(entry.payload);
      return "done";
    }
    case "note": {
      const { getDayUpdatedAt, updateDay } = await import("@/lib/data/itinerary");
      const serverUpdatedAt = await getDayUpdatedAt(entry.payload.dayId);
      const decision = resolveFieldConflict(entry.payload.editedAt, serverUpdatedAt);
      if (decision !== "apply") return "conflict";
      await updateDay(entry.payload.dayId, { notes: entry.payload.notes });
      return "done";
    }
  }
}

/**
 * Replays due writes in FIFO order. Transient failure (connectivity lost
 * mid-replay) → stays queued with backoff. Permanent failure (deleted
 * category, RLS denial, un-convertible currency) or too many attempts →
 * moved to failed_writes so it cannot block the queue. We never `break`.
 * `force` ignores backoff (the user pulled to refresh / tapped retry).
 */
export async function replayPendingWrites(force = false): Promise<ReplayResult> {
  const dbp = getOfflineDB();
  if (!dbp) return { replayed: 0, dropped: 0, conflicts: 0 };
  const db = await dbp;
  const entries = await db.getAll("pending_writes");
  if (entries.length === 0) return { replayed: 0, dropped: 0, conflicts: 0 };

  const { isConnectivityError } = await import("@/lib/data/expenses");
  const now = new Date();
  let replayed = 0;
  let dropped = 0;
  let conflicts = 0;

  for (const entry of entries) {
    if (!isDue(entry, now, force)) continue;
    try {
      const outcome = await apply(entry);
      await db.delete("pending_writes", entry.id!);
      if (outcome === "conflict") conflicts++;
      else replayed++;
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      const attempts = (entry.attempts ?? 0) + 1;
      if (isConnectivityError(e) && attempts < MAX_ATTEMPTS) {
        await db.put("pending_writes", {
          ...entry,
          attempts,
          lastError: reason,
          nextAttemptAt: new Date(now.getTime() + nextAttemptDelay(attempts)).toISOString(),
        });
      } else {
        const { id: _id, ...rest } = entry;
        void _id;
        await db.add("failed_writes", { ...rest, attempts, failedAt: now.toISOString(), reason });
        await db.delete("pending_writes", entry.id!);
        dropped++;
      }
    }
  }
  return { replayed, dropped, conflicts };
}

export async function listFailedWrites() {
  const dbp = getOfflineDB();
  if (!dbp) return [];
  return (await dbp).getAll("failed_writes");
}
