// Read/write helpers over the offline stores. All helpers no-op (or return
// empty) when IndexedDB is unavailable - callers treat cache misses as "no
// offline copy", never as errors.

import {
  getOfflineDB,
  type EmergencySnapshot,
  type MapSnapshot,
  type OfflineDocument,
  type PhrasebookSnapshot,
  type TodaySnapshot,
  type FactsSnapshot,
} from "./db";

const TODAY_KEY = "today";

// ---------- phrasebook (per generated language) ----------

export async function savePhrasebookSnapshot(
  snapshot: Omit<PhrasebookSnapshot, "savedAt">
): Promise<void> {
  const dbp = getOfflineDB();
  if (!dbp) return;
  const db = await dbp;
  await db.put("phrasebook", { ...snapshot, savedAt: new Date().toISOString() });
}

export async function readPhrasebookSnapshot(
  language: string
): Promise<PhrasebookSnapshot | null> {
  const dbp = getOfflineDB();
  if (!dbp) return null;
  const db = await dbp;
  return (await db.get("phrasebook", language)) ?? null;
}

export async function listPhrasebookLanguages(): Promise<string[]> {
  const dbp = getOfflineDB();
  if (!dbp) return [];
  const db = await dbp;
  return (await db.getAllKeys("phrasebook")) as string[];
}

// ---------- today's static map snapshot ----------

export async function saveMapSnapshot(blob: Blob, date: string): Promise<void> {
  const dbp = getOfflineDB();
  if (!dbp) return;
  const db = await dbp;
  await db.put("map_snapshot", {
    key: TODAY_KEY,
    blob,
    date,
    savedAt: new Date().toISOString(),
  });
}

export async function readMapSnapshot(): Promise<MapSnapshot | null> {
  const dbp = getOfflineDB();
  if (!dbp) return null;
  const db = await dbp;
  return (await db.get("map_snapshot", TODAY_KEY)) ?? null;
}

// ---------- today's itinerary ----------

export async function saveTodaySnapshot(
  snapshot: Omit<TodaySnapshot, "savedAt">
): Promise<void> {
  const dbp = getOfflineDB();
  if (!dbp) return;
  const db = await dbp;
  await db.put(
    "today_itinerary",
    { ...snapshot, savedAt: new Date().toISOString() },
    TODAY_KEY
  );
}

export async function readTodaySnapshot(): Promise<TodaySnapshot | null> {
  const dbp = getOfflineDB();
  if (!dbp) return null;
  const db = await dbp;
  return (await db.get("today_itinerary", TODAY_KEY)) ?? null;
}

// ---------- emergency pages (all countries kept offline) ----------

export async function saveEmergencySnapshots(
  snapshots: EmergencySnapshot[]
): Promise<void> {
  const dbp = getOfflineDB();
  if (!dbp) return;
  const db = await dbp;
  const tx = db.transaction("emergency_pages", "readwrite");
  await Promise.all(snapshots.map((s) => tx.store.put(s)));
  await tx.done;
}

export async function readEmergencySnapshots(): Promise<EmergencySnapshot[]> {
  const dbp = getOfflineDB();
  if (!dbp) return [];
  const db = await dbp;
  return db.getAll("emergency_pages");
}

/** Removes a single country's cached emergency page (after an online delete). */
export async function deleteEmergencySnapshot(countryCode: string): Promise<void> {
  const dbp = getOfflineDB();
  if (!dbp) return;
  const db = await dbp;
  await db.delete("emergency_pages", countryCode);
}

// ---------- offline documents ----------

export async function saveOfflineDocument(doc: OfflineDocument): Promise<void> {
  const dbp = getOfflineDB();
  if (!dbp) throw new Error("indexeddb unavailable");
  const db = await dbp;
  await db.put("documents_offline", doc);
}

export async function readOfflineDocument(
  id: string
): Promise<OfflineDocument | null> {
  const dbp = getOfflineDB();
  if (!dbp) return null;
  const db = await dbp;
  return (await db.get("documents_offline", id)) ?? null;
}

export async function removeOfflineDocument(id: string): Promise<void> {
  const dbp = getOfflineDB();
  if (!dbp) return;
  const db = await dbp;
  await db.delete("documents_offline", id);
}

export async function listOfflineDocumentIds(): Promise<string[]> {
  const dbp = getOfflineDB();
  if (!dbp) return [];
  const db = await dbp;
  return (await db.getAllKeys("documents_offline")) as string[];
}

// ---------- destination facts ("הידעת") ----------
//
// Cached per destination rather than as one blob: a kid reads the place they
// are in, and the trip has 14 of them.

export async function saveFactsSnapshot(
  snapshot: Omit<FactsSnapshot, "savedAt">
): Promise<void> {
  const dbp = getOfflineDB();
  if (!dbp) return;
  const db = await dbp;
  await db.put("destination_facts", {
    ...snapshot,
    savedAt: new Date().toISOString(),
  });
}

export async function readFactsSnapshot(
  key: string
): Promise<FactsSnapshot | null> {
  const dbp = getOfflineDB();
  if (!dbp) return null;
  const db = await dbp;
  return (await db.get("destination_facts", key)) ?? null;
}
