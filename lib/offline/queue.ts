// Pending-writes queue: writes made offline are stored here and replayed in
// order on reconnect (last-write-wins conflict policy, DECISIONS #10).
// Sprint 4 wires expenses; other write kinds join the same queue later.

import { getOfflineDB, type PendingWrite } from "./db";

export async function enqueueExpense(
  payload: PendingWrite["payload"]
): Promise<void> {
  const dbp = getOfflineDB();
  if (!dbp) throw new Error("indexeddb unavailable");
  const db = await dbp;
  await db.add("pending_writes", {
    kind: "expense",
    payload,
    createdAt: new Date().toISOString(),
  });
}

export type ReplayResult = { replayed: number; dropped: number };

/**
 * Replays queued writes, deleting each on success. A failure is classified:
 * a *transient* failure (connectivity lost mid-replay) leaves the entry queued
 * for the next trigger; a *permanent* failure (deleted category, RLS denial,
 * un-convertible currency — the write can never succeed as-is) is dropped so it
 * cannot block everything queued behind it (head-of-line blocking). We never
 * `break`, so one bad entry never strands the rest. `dropped` lets the caller
 * warn the family that some offline entries could not be saved.
 */
export async function replayPendingWrites(): Promise<ReplayResult> {
  const dbp = getOfflineDB();
  if (!dbp) return { replayed: 0, dropped: 0 };
  const db = await dbp;
  const entries = await db.getAll("pending_writes");
  if (entries.length === 0) return { replayed: 0, dropped: 0 };

  // dynamic import breaks the module cycle (expenses → queue → expenses)
  const { createExpense, isConnectivityError } = await import("@/lib/data/expenses");

  let replayed = 0;
  let dropped = 0;
  for (const entry of entries) {
    try {
      if (entry.kind === "expense") {
        await createExpense({
          categoryId: entry.payload.categoryId,
          amount: entry.payload.amount,
          currency: entry.payload.currency,
          description: entry.payload.description,
          spentOn: entry.payload.spentOn,
        });
      }
      await db.delete("pending_writes", entry.id!);
      replayed++;
    } catch (e) {
      // Transient (network dropped again) → keep it queued, try the rest.
      // Permanent → quarantine so it can't block later writes forever.
      if (!isConnectivityError(e)) {
        await db.delete("pending_writes", entry.id!);
        dropped++;
      }
    }
  }
  return { replayed, dropped };
}
