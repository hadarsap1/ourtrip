// Guests' views (00085) that could not be sent yet: kept on the device and
// sent when the network is back (Hadar 09/11/2026: "keep offline"). Silent on
// purpose: no toast, no pending-writes count, nothing in failed_writes - a
// guest is never told their views are recorded.
//
// One entry per target: opening the same photo three times offline is one
// view, and an episode keeps the furthest point heard.

import { getOfflineDB } from "./db";
import { mergePendingView, type PendingView } from "@/lib/views";

/** Enough for weeks without a signal; the oldest are dropped past it. */
const MAX_QUEUED = 300;

export async function queueView(view: PendingView): Promise<void> {
  const dbp = getOfflineDB();
  if (!dbp) return;
  const db = await dbp;
  const tx = db.transaction("view_outbox", "readwrite");
  const prev = await tx.store.get(view.key);
  await tx.store.put(mergePendingView(prev, view));
  const all = await tx.store.getAll();
  if (all.length > MAX_QUEUED) {
    const oldest = all.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(0, all.length - MAX_QUEUED);
    for (const v of oldest) await tx.store.delete(v.key);
  }
  await tx.done;
}

let flushing: Promise<void> | null = null;

/** Sends what is queued. A connectivity failure keeps the rest for next
 *  time; any other failure drops that one view (it would fail forever). */
export function flushViews(): Promise<void> {
  flushing ??= flushOnce().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function flushOnce(): Promise<void> {
  const dbp = getOfflineDB();
  if (!dbp) return;
  const db = await dbp;
  const queued = await db.getAll("view_outbox");
  if (queued.length === 0) return;
  const [{ saveView }, { isConnectivityError }] = await Promise.all([
    import("@/lib/data/views"),
    import("@/lib/data/expenses"),
  ]);
  for (const view of queued) {
    try {
      await saveView(view);
    } catch (e) {
      if (isConnectivityError(e)) return;
    }
    // only this entry, and only if nothing newer was merged into it meanwhile
    const tx = db.transaction("view_outbox", "readwrite");
    const current = await tx.store.get(view.key);
    if (current && current.at === view.at && current.heardSeconds === view.heardSeconds) {
      await tx.store.delete(view.key);
    }
    await tx.done;
  }
}
