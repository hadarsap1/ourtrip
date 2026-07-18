import { getSupabase } from "@/lib/supabase";
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
