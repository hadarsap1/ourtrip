import { getSupabase } from "@/lib/supabase";
import { decryptBlob, encryptBlob } from "@/lib/docCrypto";
import { resolveMime, sniffMime, withRealMime } from "@/lib/docMime";
import {
  readOfflineDocument,
  removeOfflineDocument,
  saveOfflineDocument,
} from "@/lib/offline/caches";
import type { Document } from "@/lib/types";

const BUCKET = "documents";

// Fixed tag set (SPEC 2.5). Hebrew labels live in strings.documents.tags.
export const DOCUMENT_TAGS = [
  "passport",
  "insurance",
  "vaccine",
  "visa",
  "other",
] as const;
export type DocumentTag = (typeof DOCUMENT_TAGS)[number];

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

export async function listDocuments(tripId: string): Promise<Document[]> {
  const { data, error } = await requireClient()
    .from("documents")
    .select("*")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function uploadDocument(input: {
  tripId: string;
  title: string;
  tag: string;
  notes: string | null;
  /** Optional expiry (passport, visa, insurance); null when it has none. */
  expiresAt: string | null;
  file: File;
}): Promise<void> {
  const supabase = requireClient();
  const safeName = input.file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${input.tripId}/${crypto.randomUUID()}-${safeName}`;
  // Phones often hand over a picked file with no type at all; store the
  // real one so the file opens as a PDF/photo and not an "unknown" download.
  const mime = await resolveMime(input.file);
  const body = input.file.type === mime ? input.file : new Blob([input.file], { type: mime });
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, { contentType: mime });
  if (uploadError) throw new Error(uploadError.message);

  const { error } = await supabase.from("documents").insert({
    trip_id: input.tripId,
    title: input.title.trim(),
    tag: input.tag,
    notes: input.notes?.trim() || null,
    expires_at: input.expiresAt || null,
    file_path: path,
  });
  if (error) throw new Error(error.message);
}

export async function updateDocument(
  id: string,
  patch: {
    title: string;
    tag: string;
    notes: string | null;
    expires_at: string | null;
  }
): Promise<void> {
  const { error } = await requireClient()
    .from("documents")
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** A download that gives up instead of hanging on a weak connection, so the
 *  caller falls back to the device copy or reports the failure. The timer
 *  covers the body too - a stalled body hangs as surely as a stalled request. */
async function fetchBlobTimed(url: string, ms = 30_000): Promise<Blob | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return res.ok ? await res.blob() : null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- end-to-end lock (Documents PIN) ----------

/**
 * Strips vault layers that are not the document's own lock. Locking used to
 * encrypt whatever was stored, so locking an already locked file (two
 * phones pressing "lock all", a retry after a half-finished lock, or the old
 * offline fallback) wrapped it twice, and opening it gave random bytes - the
 * "unknown"/"MacBinary" file. AES-GCM only decrypts its own ciphertext under
 * this exact key, so a real file is never altered: a layer comes off only
 * when the bytes are not a known file and the key really opens them.
 */
export async function peelVaultLayers(
  blob: Blob,
  key: CryptoKey | null,
  hint?: string | null
): Promise<Blob> {
  let current = blob;
  for (let i = 0; i < 4 && key && !(await sniffMime(current)); i += 1) {
    try {
      current = await decryptBlob(key, current, "");
    } catch {
      break; // not ours - this is the file
    }
  }
  return withRealMime(current, hint);
}

/** Downloads whatever is stored at a document's path (ciphertext for a locked
 *  document, plaintext otherwise). Online: signed URL; offline: cached copy.
 *  An unlocked document's device copy carries an extra vault layer; it is
 *  peeled here with `key`, or skipped without one, so callers never mistake
 *  that layer for the file itself. */
async function fetchBytes(doc: Document, key: CryptoKey | null = null): Promise<Blob | null> {
  if (typeof navigator !== "undefined" && navigator.onLine) {
    try {
      const blob = await fetchBlobTimed(await getDocumentUrl(doc.file_path));
      if (blob) return blob;
    } catch {
      // fall through to the offline copy
    }
  }
  const offline = await readOfflineDocument(doc.id);
  if (!offline) return null;
  if (!offline.offlineEncrypted) return offline.blob;
  if (!key) return null;
  try {
    return await decryptBlob(key, offline.blob, offline.mime);
  } catch {
    return null;
  }
}

/**
 * Locks a document: encrypts the stored file in place under the vault key and
 * flips pin_protected. A locked document is never kid-shared (kids don't have
 * the PIN), so sharing is cleared. The bucket then holds only ciphertext.
 */
export async function protectDocument(doc: Document, key: CryptoKey): Promise<void> {
  const supabase = requireClient();
  const fetched = await fetchBytes(doc, key);
  if (!fetched) throw new Error("source unavailable");
  // Down to the real file first, so exactly one layer goes back on - this
  // also repairs a file that was locked twice.
  const plain = await peelVaultLayers(fetched, key);
  const container = await encryptBlob(key, plain);
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(doc.file_path, container, { upsert: true, contentType: "application/octet-stream" });
  if (uploadError) throw new Error(uploadError.message);

  const { error } = await supabase
    .from("documents")
    .update({
      pin_protected: true,
      enc_mime: plain.type,
    })
    .eq("id", doc.id);
  if (error) throw new Error(error.message);
  await removeOfflineDocument(doc.id); // stale plaintext copy
}

/** Unlocks a document: decrypts the stored file back to plaintext in place. */
export async function unprotectDocument(doc: Document, key: CryptoKey): Promise<void> {
  const supabase = requireClient();
  const container = await fetchBytes(doc);
  if (!container) throw new Error("source unavailable");
  const plain = await peelVaultLayers(
    await decryptBlob(key, container, doc.enc_mime ?? "application/octet-stream"),
    key,
    doc.enc_mime
  );
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(doc.file_path, plain, { upsert: true, contentType: plain.type });
  if (uploadError) throw new Error(uploadError.message);

  const { error } = await supabase
    .from("documents")
    .update({ pin_protected: false, enc_mime: null })
    .eq("id", doc.id);
  if (error) throw new Error(error.message);
  await removeOfflineDocument(doc.id);
}

/** Decrypts a locked document to a viewable plaintext blob (wrong key → null). */
export async function decryptDocument(
  doc: Document,
  key: CryptoKey
): Promise<Blob | null> {
  const container = await fetchBytes(doc);
  if (!container) return null;
  let plain: Blob;
  try {
    plain = await decryptBlob(key, container, doc.enc_mime ?? "application/octet-stream");
  } catch {
    return null; // wrong key / corrupt
  }
  // enc_mime was copied from the stored file's label, which was often empty
  // on phones; the decrypted bytes say what they really are.
  return peelVaultLayers(plain, key, doc.enc_mime);
}

/**
 * The readable file, for viewing and for sharing (1.4): online or from the
 * device copy, decrypted where needed and labelled with its real type.
 * "needs-key" when only a vault-encrypted copy is reachable and no key was
 * given. Never sent anywhere by this app; the caller shows it in the in-app
 * viewer or hands it to the phone's own share sheet.
 */
export async function getPlainDocument(
  doc: Document,
  key: CryptoKey | null
): Promise<Blob | "needs-key" | null> {
  if (doc.pin_protected) {
    if (!key) return "needs-key";
    return decryptDocument(doc, key);
  }
  if (typeof navigator !== "undefined" && navigator.onLine) {
    try {
      const blob = await fetchBlobTimed(await getDocumentUrl(doc.file_path));
      if (blob) {
        // Not a known file: most likely an unlocked row over a file that is
        // still vault ciphertext (a lock or unlock that stopped halfway).
        // Ask for the key and peel it.
        if (!key && !(await sniffMime(blob))) return "needs-key";
        return peelVaultLayers(blob, key);
      }
    } catch {
      // fall through to the device copy
    }
  }
  const offline = await readOfflineDocument(doc.id);
  if (!offline) return null;
  if (!offline.offlineEncrypted) return withRealMime(offline.blob, offline.mime);
  if (!key) return "needs-key";
  try {
    return await peelVaultLayers(
      await decryptBlob(key, offline.blob, offline.mime),
      key,
      offline.mime
    );
  } catch {
    return null;
  }
}

/** Plain-text summary for "copy details": title, type, expiry, notes. */
export function documentDetailsText(
  doc: Pick<Document, "title" | "tag" | "expires_at" | "notes">,
  tagLabel: string,
  expiresLabel: (date: string) => string
): string {
  return [doc.title, tagLabel, doc.expires_at ? expiresLabel(doc.expires_at) : null, doc.notes]
    .filter(Boolean)
    .join("\n");
}

/** Removes row, storage object, and any offline copy. */
export async function deleteDocument(doc: Document): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.from("documents").delete().eq("id", doc.id);
  if (error) throw new Error(error.message);
  // best-effort cleanups - the row is the source of truth
  await supabase.storage.from(BUCKET).remove([doc.file_path]);
  await removeOfflineDocument(doc.id);
}

export async function getDocumentUrl(path: string): Promise<string> {
  const { data, error } = await requireClient()
    .storage.from(BUCKET)
    .createSignedUrl(path, 60 * 5);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

// ---------- offline copies ----------

/**
 * Downloads the file and stores it in IndexedDB for offline access -
 * encrypted at rest under the vault key.
 *
 * Before the 2026-08 review this wrote the file as-is, so an unlocked
 * document (the default) sat readable in IndexedDB with no passphrase in
 * front of it: a found phone opened the passport. Now every offline copy is
 * ciphertext.
 *
 * A pin_protected document is already stored as its own ciphertext, so it is
 * saved unchanged and `offlineEncrypted` stays false - decryptDocument owns
 * that unwrapping. Everything else gets a layer here.
 */
export async function makeAvailableOffline(
  doc: Document,
  key: CryptoKey | null,
  onPct?: (pct: number) => void
): Promise<void> {
  // Never write plaintext: an unprotected document needs the vault key.
  if (!doc.pin_protected && !key) throw new Error("vault key required");
  const url = await getDocumentUrl(doc.file_path);
  const { fetchWithProgress } = await import("@/lib/offline/docSync");
  const fetched = await fetchWithProgress(url, onPct ?? (() => {}));
  const blob = doc.pin_protected ? fetched : await withRealMime(fetched);

  const store = doc.pin_protected ? blob : await encryptBlob(key as CryptoKey, blob);
  await saveOfflineDocument({
    id: doc.id,
    title: doc.title,
    tag: doc.tag,
    mime: blob.type,
    blob: store,
    savedAt: new Date().toISOString(),
    offlineEncrypted: !doc.pin_protected,
  });
}

export { listOfflineDocumentIds, removeOfflineDocument } from "@/lib/offline/caches";
