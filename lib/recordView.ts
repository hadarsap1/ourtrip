// The guest's side of 00085: record that this guest saw an update, opened a
// photo or played an episode. Guests only (Hadar 09/11/2026); a parent's
// "view as guest" session is a test, not a view. Failure is silent - offline
// or on a network error the view waits on the device (viewOutbox).

import { readPreview } from "@/lib/preview";
import type { Member } from "@/lib/types";
import { viewKey, type ViewTarget } from "@/lib/views";

export function countsViews(member: Pick<Member, "role" | "is_preview"> | null | undefined): boolean {
  if (!member || member.role !== "guest" || member.is_preview) return false;
  return typeof window !== "undefined" && readPreview() === null;
}

/** Updates and photos sent this visit: the server keeps one row per guest
 *  anyway, this only spares the repeated calls while scrolling. */
const sentThisVisit = new Set<string>();

export async function recordView(target: ViewTarget, heardSeconds = 0): Promise<void> {
  const key = viewKey(target);
  const isEpisode = "episodeId" in target;
  if (!isEpisode && sentThisVisit.has(key)) return;
  if (!isEpisode) sentThisVisit.add(key);
  const view = { key, target, heardSeconds, at: new Date().toISOString() };
  const { queueView, flushViews } = await import("@/lib/offline/viewOutbox");
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    await queueView(view).catch(() => {});
    return;
  }
  try {
    const { saveView } = await import("@/lib/data/views");
    await saveView(view);
    // the network is back: whatever waited on the device goes too
    void flushViews().catch(() => {});
  } catch (e) {
    const { isConnectivityError } = await import("@/lib/data/expenses");
    if (isConnectivityError(e)) await queueView(view).catch(() => {});
  }
}
