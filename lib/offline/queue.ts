// Pending-writes queue: writes made offline are stored here and replayed in
// order on reconnect (last-write-wins conflict policy, DECISIONS #10).
//
// Covers expenses, journal entries, checklist check-offs, pocket-money lines
// and itinerary status changes (audit S-1). Anything not queueable — an upload,
// a delete, a structural edit — still fails loudly online, which is correct:
// those are deliberate acts the family should retry with the network back.

import { getOfflineDB, type PendingWrite } from "./db";

/** Everything except the fields the store fills in. */
type NewPendingWrite = Omit<PendingWrite, "id" | "createdAt">;

export async function enqueueWrite(entry: NewPendingWrite): Promise<void> {
  const dbp = getOfflineDB();
  if (!dbp) throw new Error("indexeddb unavailable");
  const db = await dbp;
  await db.add("pending_writes", {
    ...entry,
    createdAt: new Date().toISOString(),
  } as PendingWrite);
}

/** Kept as a named helper because the expense fast path calls it by name. */
export async function enqueueExpense(
  payload: Extract<PendingWrite, { kind: "expense" }>["payload"]
): Promise<void> {
  await enqueueWrite({ kind: "expense", payload });
}

/** Number of writes still waiting, for the "N waiting to sync" indicator. */
export async function countPendingWrites(): Promise<number> {
  const dbp = getOfflineDB();
  if (!dbp) return 0;
  const db = await dbp;
  return db.count("pending_writes");
}

/** Applies one queued write. Throws on failure; the caller classifies. */
async function applyWrite(entry: PendingWrite): Promise<void> {
  // Dynamic imports break the module cycle (data modules → queue → data
  // modules) and keep the replay path out of the initial bundle.
  switch (entry.kind) {
    case "expense": {
      const { createExpense } = await import("@/lib/data/expenses");
      await createExpense(entry.payload);
      return;
    }
    case "journal": {
      const { createJournalEntry } = await import("@/lib/data/journal");
      await createJournalEntry(entry.payload);
      return;
    }
    case "checklist-item": {
      const { setItemChecked } = await import("@/lib/data/checklists");
      await setItemChecked(entry.payload.itemId, entry.payload.checked);
      return;
    }
    case "pocket-expense": {
      const { addPocketExpense } = await import("@/lib/data/pocket");
      await addPocketExpense(entry.payload);
      return;
    }
    case "itinerary-status": {
      const { updateItem } = await import("@/lib/data/itinerary");
      await updateItem(entry.payload.itemId, { status: entry.payload.status });
      return;
    }
  }
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

  const { isConnectivityError } = await import("@/lib/data/expenses");

  let replayed = 0;
  let dropped = 0;
  for (const entry of entries) {
    try {
      await applyWrite(entry);
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

/**
 * Runs a write, and queues it for replay instead of failing when the failure
 * looks like lost connectivity. Returns what happened so the caller can say
 * "saved" or "saved, will sync" rather than showing a generic error for a
 * write that is safely stored on the device.
 */
export async function saveOrQueue(
  write: () => Promise<unknown>,
  queued: NewPendingWrite
): Promise<"saved" | "queued"> {
  const { isConnectivityError } = await import("@/lib/data/expenses");
  try {
    await write();
    return "saved";
  } catch (e) {
    if (!isConnectivityError(e)) throw e;
    await enqueueWrite(queued);
    return "queued";
  }
}
