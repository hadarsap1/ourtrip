// Receipt photos on expenses (00083, DECISIONS #53).
//
// Any number per expense, owners only. The client picks each receipt's id and
// its object path, so a write replayed from the offline queue after it had in
// fact gone through is recognised (same id, same path) rather than saved twice.

import { getSupabase } from "@/lib/supabase";
import { getActiveTrip, getCurrentMember } from "@/lib/data/trip";
import { isConnectivityError } from "@/lib/data/expenses";
import { compressImage } from "@/lib/images";
import type { ExpenseReceipt } from "@/lib/types";

export const RECEIPTS_BUCKET = "expense-receipts";

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

export type PreparedReceipt = { blob: Blob; mime: string };

/** Shrinks a photo before it is kept or uploaded (~1600px JPEG, lib/images).
 *  A format the browser cannot decode (HEIC on some Androids) goes up as it
 *  is rather than being refused. */
export async function prepareReceipt(file: File): Promise<PreparedReceipt> {
  try {
    const blob = await compressImage(file);
    return { blob, mime: "image/jpeg" };
  } catch {
    return { blob: file, mime: file.type || "image/jpeg" };
  }
}

function extensionFor(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heic" || mime === "image/heif") return "heic";
  return "jpg";
}

export type ReceiptUpload = {
  id: string;
  tripId: string;
  expenseId: string;
  blob: Blob;
  mime: string;
};

/** Storage first, row second (as booking files): the other order could leave
 *  a row pointing at nothing - a receipt you can see and cannot open. */
export async function uploadReceipt(input: ReceiptUpload): Promise<void> {
  const supabase = requireClient();
  const member = await getCurrentMember();
  const path = `${input.tripId}/${input.expenseId}/${input.id}.${extensionFor(input.mime)}`;

  // upsert: a replay of an upload that already landed overwrites the same
  // object instead of failing on it
  const { error: uploadError } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .upload(path, input.blob, { contentType: input.mime, upsert: true });
  if (uploadError) throw new Error(uploadError.message);

  const { error } = await supabase.from("expense_receipts").insert({
    id: input.id,
    trip_id: input.tripId,
    expense_id: input.expenseId,
    file_path: path,
    mime_type: input.mime,
    size_bytes: input.blob.size,
    created_by: member?.id ?? null,
  });
  // 23505: this very receipt is already recorded - a replay, nothing to do
  if (error && error.code !== "23505") {
    if (!isConnectivityError(error)) {
      // no row will ever reach this object: do not leave it against the quota
      await supabase.storage.from(RECEIPTS_BUCKET).remove([path]).catch(() => {});
    }
    throw new Error(error.message);
  }
}

/** Uploads now, or keeps the photo on the phone and uploads it on reconnect.
 *  `forceQueue` is for a receipt of an expense that is itself still queued:
 *  it cannot go up before its expense exists, and the queue replays in order. */
export async function addReceiptOrQueue(
  input: Omit<ReceiptUpload, "tripId" | "id"> & { id?: string; forceQueue?: boolean }
): Promise<"saved" | "queued"> {
  const trip = await getActiveTrip();
  if (!trip) throw new Error("missing receipt context");
  const upload: ReceiptUpload = {
    id: input.id ?? crypto.randomUUID(),
    tripId: trip.id,
    expenseId: input.expenseId,
    blob: input.blob,
    mime: input.mime,
  };
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (!input.forceQueue && !offline) {
    try {
      await uploadReceipt(upload);
      return "saved";
    } catch (e) {
      if (!isConnectivityError(e)) throw e;
    }
  }
  const { enqueueReceipt } = await import("@/lib/offline/queue");
  await enqueueReceipt(upload);
  return "queued";
}

export async function listReceipts(tripId: string): Promise<ExpenseReceipt[]> {
  const { data, error } = await requireClient()
    .from("expense_receipts")
    .select("*")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}

/** Row first, object second: a leftover object shows nothing, a leftover row
 *  would show a receipt that cannot be opened. */
export async function deleteReceipt(receipt: Pick<ExpenseReceipt, "id" | "file_path">): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.from("expense_receipts").delete().eq("id", receipt.id);
  if (error) throw new Error(error.message);
  await supabase.storage.from(RECEIPTS_BUCKET).remove([receipt.file_path]).catch(() => {});
}

/** Short-lived signed URLs, one call for all of an expense's receipts. */
export async function getReceiptUrls(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  const { data, error } = await requireClient()
    .storage.from(RECEIPTS_BUCKET)
    .createSignedUrls(paths, 60 * 10);
  if (error) throw new Error(error.message);
  for (const item of data) {
    if (item.path && item.signedUrl) out.set(item.path, item.signedUrl);
  }
  return out;
}
