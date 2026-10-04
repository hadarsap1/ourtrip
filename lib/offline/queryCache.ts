// Stale-while-revalidate for screen data (F9): a screen shows the last good
// result from IndexedDB at once, then refreshes from the network and saves the
// new result. Only what RLS already returned to this user is stored, on this
// device. Document FILES never go here - only list metadata.

import { getOfflineDB } from "./db";

export type Cached<T> = { data: T; savedAt: string };

export async function readQuery<T>(key: string): Promise<Cached<T> | null> {
  const dbp = getOfflineDB();
  if (!dbp) return null;
  try {
    const row = await (await dbp).get("query_cache", key);
    return row ? { data: row.data as T, savedAt: row.savedAt } : null;
  } catch {
    return null;
  }
}

export async function writeQuery<T>(key: string, data: T): Promise<void> {
  const dbp = getOfflineDB();
  if (!dbp) return;
  try {
    await (await dbp).put("query_cache", { key, data, savedAt: new Date().toISOString() });
  } catch {
    // quota or private mode: the screen still works online
  }
}

export const queryKeys = {
  itinerary: (tripId: string) => `itinerary:${tripId}`,
  budget: (tripId: string) => `budget:${tripId}`,
  documents: (tripId: string) => `documents:${tripId}`,
};
