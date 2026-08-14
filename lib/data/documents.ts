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

// ---------- expiry (audit M-1) ----------

/** Passports are the special case: most border controls refuse entry on a
 *  passport with under six months of validity left, so "valid until next
 *  March" is already a problem in January. Everything else warns at a month. */
const EXPIRY_WARN_DAYS: Record<string, number> = {
  passport: 180,
  visa: 30,
  insurance: 30,
  vaccine: 30,
  other: 30,
};

export type ExpiryLevel = "expired" | "critical" | "soon" | "ok";

export type ExpiryStatus = {
  level: ExpiryLevel;
  /** Whole days from `today` to the expiry date; negative once past. */
  daysLeft: number;
};

/**
 * Classifies a document's expiry relative to `today` (ISO date).
 * `critical` means inside the tag's own threshold — six months for a passport,
 * a month for everything else; `soon` is the month before that threshold, so a
 * passport starts nagging gently at seven months out rather than silently
 * flipping to red. Returns null when the document carries no expiry date.
 */
export function expiryStatus(
  doc: Pick<Document, "expires_on" | "tag">,
  today: string
): ExpiryStatus | null {
  if (!doc.expires_on) return null;
  const daysLeft = Math.round(
    (Date.parse(`${doc.expires_on}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) /
      86_400_000
  );
  const threshold = EXPIRY_WARN_DAYS[doc.tag] ?? 30;
  if (daysLeft < 0) return { level: "expired", daysLeft };
  if (daysLeft <= threshold) return { level: "critical", daysLeft };
  if (daysLeft <= threshold + 30) return { level: "soon", daysLeft };
  return { level: "ok", daysLeft };
}

export async function uploadDocument(input: {
  tripId: string;
  title: string;
  tag: string;
  notes: string | null;
  expiresOn: string | null;
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
    expires_on: input.expiresOn || null,
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
    expires_on: string | null;
  }
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

/** Downloads the file and stores it in IndexedDB for offline access. */
export async function makeAvailableOffline(doc: Document): Promise<void> {
  const url = await getDocumentUrl(doc.file_path);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  const blob = await res.blob();
  await saveOfflineDocument({
    id: doc.id,
    title: doc.title,
    tag: doc.tag,
    mime: blob.type,
    blob,
    savedAt: new Date().toISOString(),
  });
}

export { listOfflineDocumentIds, removeOfflineDocument } from "@/lib/offline/caches";

/**
 * Opens a document: online → fresh signed URL; offline (or fetch failure)
 * → the IndexedDB copy, if the document was flagged for offline.
 * Returns false when no copy could be opened.
 */
export async function openDocument(doc: Document): Promise<boolean> {
  if (typeof navigator === "undefined") return false;
  if (navigator.onLine) {
    try {
      const url = await getDocumentUrl(doc.file_path);
      window.open(url, "_blank", "noopener");
      return true;
    } catch {
      // fall through to the offline copy
    }
  }
  const offline = await readOfflineDocument(doc.id);
  if (!offline) return false;
  window.open(URL.createObjectURL(offline.blob), "_blank", "noopener");
  return true;
}
