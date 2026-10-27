import { getSupabase } from "@/lib/supabase";
import { compressImage } from "@/lib/images";
import { todayISO } from "@/lib/format";
import type { Tables } from "@/lib/database.types";

export type Photo = Tables<"photos">;
export type PhotoWithUrl = Photo & { url: string | null };

const BUCKET = "photos";
const PUBLIC_BUCKET = "public-stories";

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
  /** [] = every guest once shared; else only these groups (00063/00064).
   *  Sharing stays a parent's separate step (#5). */
  audience?: string[];
}): Promise<Photo> {
  const supabase = requireClient();
  const blob = await compressImage(input.file);
  const path = `${input.tripId}/${crypto.randomUUID()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: "image/jpeg" });
  if (uploadError) throw new Error(uploadError.message);

  const { data, error } = await supabase
    .from("photos")
    .insert({
      trip_id: input.tripId,
      uploaded_by: input.memberId,
      file_path: path,
      caption: input.caption?.trim() || null,
      taken_on: todayISO(),
      journal_entry_id: input.journalEntryId ?? null,
      audience: input.audience ?? [],
      ...(input.isOwner
        ? { status: "approved" as const, approved_by: input.memberId }
        : {}),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ---------- owner moderation ----------

/**
 * Takes a photo off the open blog (00046): deletes its public copies and the
 * links to them. Called whenever a photo stops qualifying for the open page
 * (unshared, rejected, kept for some groups, deleted), so a public story
 * never keeps showing what guests can no longer see (hard rule 3).
 */
async function withdrawPublicCopies(photoId: string): Promise<void> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("post_photos")
    .select("public_path")
    .eq("photo_id", photoId)
    .not("public_path", "is", null);
  if (error) throw new Error(error.message);
  const paths = (data ?? []).map((r) => r.public_path).filter((p): p is string => p !== null);
  if (paths.length === 0) return;
  await supabase.storage.from(PUBLIC_BUCKET).remove(paths);
  const { error: unlinkError } = await supabase
    .from("post_photos")
    .update({ public_path: null })
    .eq("photo_id", photoId)
    .not("public_path", "is", null);
  if (unlinkError) throw new Error(unlinkError.message);
}

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
  await withdrawPublicCopies(id);
}

/** Separate explicit step from approval (DECISIONS #5). */
export async function setPhotoShared(id: string, shared: boolean): Promise<void> {
  const { error } = await requireClient()
    .from("photos")
    .update({ shared_with_guests: shared })
    .eq("id", id);
  if (error) throw new Error(error.message);
  if (!shared) await withdrawPublicCopies(id);
}

/** Which guests a shared photo reaches (00063): [] = every guest. Narrows
 *  DECISIONS #5, never widens it - an unshared photo stays hidden. */
export async function setPhotoAudience(id: string, audience: string[]): Promise<void> {
  const { error } = await requireClient().from("photos").update({ audience }).eq("id", id);
  if (error) throw new Error(error.message);
  if (audience.length > 0) await withdrawPublicCopies(id);
}

export async function deletePhoto(photo: Photo): Promise<void> {
  const supabase = requireClient();
  // before the delete: the post_photos links cascade with it, and after that
  // nothing says which public copies were this photo's
  await withdrawPublicCopies(photo.id);
  const { error } = await supabase.from("photos").delete().eq("id", photo.id);
  if (error) throw new Error(error.message);
  await supabase.storage.from(BUCKET).remove([photo.file_path]);
}
