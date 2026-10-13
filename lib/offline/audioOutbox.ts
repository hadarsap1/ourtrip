// Recordings made with no connection wait here until they can upload
// (CLAUDE.md rule #6: everything else degrades gracefully). A kid records on
// a bus or a plane; the episode is saved on the tablet and goes up on the
// next visit to the podcast screen with a signal.
//
// Its own small IndexedDB database rather than a new store in lib/offline/db:
// audio blobs are large and short-lived, and keeping them apart means a
// schema bump here can never disturb the documents vault or the write queue.

import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type QueuedRecording = {
  id: string;
  tripId: string;
  memberId: string;
  isOwner: boolean;
  title: string;
  description: string | null;
  mime: string;
  durationSeconds: number;
  blob: Blob;
  createdAt: string;
};

interface AudioOutbox extends DBSchema {
  recordings: { key: string; value: QueuedRecording };
}

let dbp: Promise<IDBPDatabase<AudioOutbox>> | null = null;

function db(): Promise<IDBPDatabase<AudioOutbox>> | null {
  if (typeof indexedDB === "undefined") return null;
  dbp ??= openDB<AudioOutbox>("ourtrip-audio", 1, {
    upgrade(database) {
      database.createObjectStore("recordings", { keyPath: "id" });
    },
  });
  return dbp;
}

export async function queueRecording(rec: QueuedRecording): Promise<void> {
  const handle = db();
  if (!handle) throw new Error("indexeddb unavailable");
  await (await handle).put("recordings", rec);
}

export async function listQueuedRecordings(): Promise<QueuedRecording[]> {
  const handle = db();
  if (!handle) return [];
  return (await handle).getAll("recordings");
}

export async function removeQueuedRecording(id: string): Promise<void> {
  const handle = db();
  if (!handle) return;
  await (await handle).delete("recordings", id);
}
