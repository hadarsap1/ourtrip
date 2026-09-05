import { getSupabase } from "@/lib/supabase";
import { compressImage } from "@/lib/images";
import { todayISO } from "@/lib/format";
import type { Tables } from "@/lib/database.types";

export type Photo = Tables<"photos">;
export type PhotoWithUrl = Photo & { url: string | null };

const BUCKET = "photos";

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

/** All family-visible photos with signed URLs (RLS scopes rows by role). */
export async function listPhotos(tripId: string): Promise<PhotoWithUrl[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("photos")
    .select("*")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  if (data.length === 0) return [];

  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(data.map((p) => p.file_path), 60 * 60);
  const urlByPath = new Map(
    (signed ?? []).map((s) => [s.path, s.signedUrl ?? null])
  );
  return data.map((p) => ({ ...p, url: urlByPath.get(p.file_path) ?? null }));
}

/**
 * Compress + upload + insert row. Kid uploads land as pending/unshared no
 * matter what (00001 trigger); owner uploads default to approved
 * (SCHEMA rule: owner uploads may skip approval - sharing stays a separate
 * explicit step, DECISIONS #5).
 */
export async function uploadPhoto(input: {
  tripId: string;
  memberId: string;
  isOwner: boolean;
  file: File;
  caption?: string | null;
  journalEntryId?: string | null;
}): Promise<void> {
  const supabase = requireClient();
  const blob = await compressImage(input.file);
  const path = `${input.tripId}/${crypto.randomUUID()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: "image/jpeg" });
  if (uploadError) throw new Error(uploadError.message);

  const { error } = await supabase.from("photos").insert({
    trip_id: input.tripId,
    uploaded_by: input.memberId,
    file_path: path,
    caption: input.caption?.trim() || null,
    taken_on: todayISO(),
    journal_entry_id: input.journalEntryId ?? null,
    ...(input.isOwner
      ? { status: "approved" as const, approved_by: input.memberId }
      : {}),
  });
  if (error) throw new Error(error.message);
}

// ---------- owner moderation ----------

export async function approvePhoto(id: string, ownerId: string): Promise<void> {
  const { error } = await requireClient()
    .from("photos")
    .update({ status: "approved", approved_by: ownerId })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function rejectPhoto(id: string, ownerId: string): Promise<void> {
  const { error } = await requireClient()
    .from("photos")
    .update({ status: "rejected", approved_by: ownerId, shared_with_guests: false })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Separate explicit step from approval (DECISIONS #5). */
export async function setPhotoShared(id: string, shared: boolean): Promise<void> {
  const { error } = await requireClient()
    .from("photos")
    .update({ shared_with_guests: shared })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deletePhoto(photo: Photo): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.from("photos").delete().eq("id", photo.id);
  if (error) throw new Error(error.message);
  await supabase.storage.from(BUCKET).remove([photo.file_path]);
}
