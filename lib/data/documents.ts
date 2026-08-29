import { getSupabase } from "@/lib/supabase";
import { decryptBlob, encryptBlob } from "@/lib/docCrypto";
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
  file: File;
}): Promise<void> {
  const supabase = requireClient();
  const safeName = input.file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${input.tripId}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, input.file, { contentType: input.file.type || undefined });
  if (uploadError) throw new Error(uploadError.message);

  const { error } = await supabase.from("documents").insert({
    trip_id: input.tripId,
    title: input.title.trim(),
    tag: input.tag,
    notes: input.notes?.trim() || null,
    file_path: path,
  });
  if (error) throw new Error(error.message);
}

export async function updateDocument(
  id: string,
  patch: { title: string; tag: string; notes: string | null }
): Promise<void> {
  const { error } = await requireClient()
    .from("documents")
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Owner opts a single document in/out of kid visibility (B1). */
export async function setDocumentSharedWithKids(
  id: string,
  shared: boolean
): Promise<void> {
  const { error } = await requireClient()
    .from("documents")
    .update({ shared_with_kids: shared })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------- end-to-end lock (Documents PIN) ----------

/** Downloads whatever is stored at a document's path (ciphertext for a locked
 *  document, plaintext otherwise). Online: signed URL; offline: cached copy. */
async function fetchBytes(doc: Document): Promise<Blob | null> {
  if (typeof navigator !== "undefined" && navigator.onLine) {
    try {
      const url = await getDocumentUrl(doc.file_path);
      const res = await fetch(url);
      if (res.ok) return await res.blob();
    } catch {
      // fall through to the offline copy
    }
  }
  const offline = await readOfflineDocument(doc.id);
  return offline ? offline.blob : null;
}

/**
 * Locks a document: encrypts the stored file in place under the vault key and
 * flips pin_protected. A locked document is never kid-shared (kids don't have
 * the PIN), so sharing is cleared. The bucket then holds only ciphertext.
 */
export async function protectDocument(doc: Document, key: CryptoKey): Promise<void> {
  const supabase = requireClient();
  const plain = await fetchBytes(doc);
  if (!plain) throw new Error("source unavailable");
  const container = await encryptBlob(key, plain);
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(doc.file_path, container, { upsert: true, contentType: "application/octet-stream" });
  if (uploadError) throw new Error(uploadError.message);

  const { error } = await supabase
    .from("documents")
    .update({
      pin_protected: true,
      enc_mime: plain.type || "application/octet-stream",
      shared_with_kids: false,
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
  const plain = await decryptBlob(key, container, doc.enc_mime ?? "application/octet-stream");
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(doc.file_path, plain, { upsert: true, contentType: plain.type || undefined });
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
  try {
    return await decryptBlob(key, container, doc.enc_mime ?? "application/octet-stream");
  } catch {
    return null; // wrong key / corrupt
  }
}

/** Removes row, storage object, and any offline copy. */
export async function deleteDocument(doc: Document): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.from("documents").delete().eq("id", doc.id);
  if (error) throw new Error(error.message);
  // best-effort cleanups — the row is the source of truth
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
 * Downloads the file and stores it in IndexedDB for offline access —
 * encrypted at rest under the vault key.
 *
 * Before the 2026-08 review this wrote the file as-is, so an unlocked
 * document (the default) sat readable in IndexedDB with no passphrase in
 * front of it: a found phone opened the passport. Now every offline copy is
 * ciphertext.
 *
 * A pin_protected document is already stored as its own ciphertext, so it is
 * saved unchanged and `offlineEncrypted` stays false — decryptDocument owns
 * that unwrapping. Everything else gets a layer here.
 */
export async function makeAvailableOffline(
  doc: Document,
  key: CryptoKey
): Promise<void> {
  const url = await getDocumentUrl(doc.file_path);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  const blob = await res.blob();

  const store = doc.pin_protected ? blob : await encryptBlob(key, blob);
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

export type OpenResult = "opened" | "needs-key" | "unavailable";

/**
 * Opens a document: online → fresh signed URL; offline (or fetch failure)
 * → the IndexedDB copy, if the document was flagged for offline.
 *
 * Returns "needs-key" when the only available copy is an encrypted offline
 * one and no vault key was supplied — the caller prompts and retries. Going
 * online never needs the key, so the common path is unchanged.
 */
export async function openDocument(
  doc: Document,
  key: CryptoKey | null = null
): Promise<OpenResult> {
  if (typeof navigator === "undefined") return "unavailable";
  if (navigator.onLine) {
    try {
      const url = await getDocumentUrl(doc.file_path);
      window.open(url, "_blank", "noopener");
      return "opened";
    } catch {
      // fall through to the offline copy
    }
  }
  const offline = await readOfflineDocument(doc.id);
  if (!offline) return "unavailable";

  let blob = offline.blob;
  if (offline.offlineEncrypted) {
    if (!key) return "needs-key";
    try {
      blob = await decryptBlob(key, blob, offline.mime);
    } catch {
      return "unavailable"; // wrong key or corrupt copy
    }
  }
  window.open(URL.createObjectURL(blob), "_blank", "noopener");
  return "opened";
}
