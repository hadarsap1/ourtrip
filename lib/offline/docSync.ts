// F1: every document available offline without a tap per file.
//
// Offline copies are AES-GCM wrapped under the vault key (security review M2),
// and that key exists only in memory after the PIN/biometric unlock. So the
// rule is: whenever the device is online, download every document whose copy
// can be written right now - pin_protected files are already ciphertext and
// need no key; the rest need the vault open. Files are fetched one at a time
// (a weak connection on the road should not choke on six parallel PDFs).
// After the first file lands, ask the browser to make storage persistent so
// the OS does not evict the passports under storage pressure.

export type DocSyncState = "missing" | "locked" | "queued" | "downloading" | "ready" | "failed";
export type DocSyncStatus = { state: DocSyncState; pct?: number };

export type SyncableDoc = { id: string; pin_protected: boolean };

/** Which documents to fetch now, and which wait for the vault. Pure. */
export function planDocSync<T extends SyncableDoc>(
  docs: T[],
  offlineIds: Set<string>,
  haveKey: boolean
): { fetch: T[]; locked: T[] } {
  const fetch: T[] = [];
  const locked: T[] = [];
  for (const d of docs) {
    if (offlineIds.has(d.id)) continue;
    if (d.pin_protected || haveKey) fetch.push(d);
    else locked.push(d);
  }
  return { fetch, locked };
}

/** fetch() that reports 0-100 as the body streams in (when length is known). */
export async function fetchWithProgress(url: string, onPct: (pct: number) => void): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  const total = Number(res.headers.get("content-length")) || 0;
  if (!res.body || !total) {
    const blob = await res.blob();
    onPct(100);
    return blob;
  }
  const reader = res.body.getReader();
  const chunks: BlobPart[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.byteLength;
    onPct(Math.min(99, Math.round((got / total) * 100)));
  }
  onPct(100);
  return new Blob(chunks, { type: res.headers.get("content-type") ?? "" });
}

export type PersistState = "persisted" | "denied" | "unsupported";
const PERSIST_ASKED_KEY = "ourtrip-storage-persist-asked";

/**
 * navigator.storage.persist(), asked once per device after the first
 * successful document sync. Chrome grants it silently for installed PWAs;
 * Safari decides on its own heuristics. ❌ iOS behaviour to verify on device.
 */
export async function requestPersistentStorage(): Promise<PersistState> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return "unsupported";
  try {
    if (await navigator.storage.persisted()) return "persisted";
    let asked = false;
    try {
      asked = window.localStorage.getItem(PERSIST_ASKED_KEY) === "1";
      window.localStorage.setItem(PERSIST_ASKED_KEY, "1");
    } catch {
      // storage blocked: ask anyway
    }
    if (asked) return (await navigator.storage.persisted()) ? "persisted" : "denied";
    return (await navigator.storage.persist()) ? "persisted" : "denied";
  } catch {
    return "unsupported";
  }
}

export async function isStoragePersisted(): Promise<boolean> {
  try {
    return Boolean(await navigator.storage?.persisted?.());
  } catch {
    return false;
  }
}
