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

/**
 * Replays queued writes in order, deleting each on success. Stops at the
 * first failure (still offline / server error) and retries on the next
 * trigger. Returns how many writes were replayed.
 */
export async function replayPendingWrites(): Promise<number> {
  const dbp = getOfflineDB();
  if (!dbp) return 0;
  const db = await dbp;
  const entries = await db.getAll("pending_writes");
  if (entries.length === 0) return 0;

  // dynamic import breaks the module cycle (expenses → queue → expenses)
  const { createExpense } = await import("@/lib/data/expenses");

  let replayed = 0;
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
    } catch {
      break;
    }
  }
  return replayed;
}
