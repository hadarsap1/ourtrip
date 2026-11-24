import { getSupabase } from "@/lib/supabase";
import { signPaths } from "@/lib/data/signedUrls";
import { compressImage, makeThumbnail, thumbPathFor } from "@/lib/images";
import { photoTakenOn } from "@/lib/exifDate";
import { todayISO } from "@/lib/format";
import { prepareVideo, videoDay } from "@/lib/video";
import type { Tables } from "@/lib/database.types";

export type Photo = Tables<"photos">;
/** `url` is always a picture: the photo, or a video's poster frame (00099).
 *  `videoUrl` is the video itself, null for a photo. `thumbUrl` is the small
 *  copy for grid tiles (00105), null until one is made: use `thumbUrl ?? url`
 *  for a tile and `url` for a photo opened full size. */
export type PhotoWithUrl = Photo & { url: string | null; videoUrl: string | null; thumbUrl: string | null };

const BUCKET = "photos";
const PUBLIC_BUCKET = "public-stories";

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

type MediaRow = { file_path: string; media_type: string; poster_path: string | null; thumb_path?: string | null };

/**
 * Signed URLs for rows the family may read (owners and kids read the private
 * bucket directly, 00007). A photo: its file. A video (00099): its poster as
 * `url`, so every thumbnail shows a picture, and the file as `videoUrl`.
 */
export async function signFamilyMedia<T extends MediaRow>(
  rows: T[],
  ttlSeconds = 60 * 60
): Promise<(T & { url: string | null; videoUrl: string | null; thumbUrl: string | null })[]> {
  if (rows.length === 0) return [];
  const paths = rows.flatMap((r) => [r.file_path, r.poster_path, r.thumb_path].filter((p): p is string => !!p));
  const urlByPath = await signPaths(BUCKET, paths, ttlSeconds);
  const at = (path: string | null | undefined) => (path ? (urlByPath.get(path) ?? null) : null);
  return rows.map((r) =>
    r.media_type === "video"
      ? { ...r, url: at(r.poster_path), videoUrl: at(r.file_path), thumbUrl: at(r.thumb_path) }
      : { ...r, url: at(r.file_path), videoUrl: null, thumbUrl: at(r.thumb_path) }
  );
}

/**
 * Makes and uploads the grid thumbnail of `picture` (a photo, or a video's
 * poster) next to `picturePath`. Best effort: a failure leaves the photo
 * without one (grids fall back to the full picture) rather than failing the
 * upload. Returns its path, or null.
 */
async function uploadThumbnail(picturePath: string, picture: Blob): Promise<string | null> {
  try {
    const thumb = await makeThumbnail(picture);
    const thumbPath = thumbPathFor(picturePath);
    const { error } = await requireClient()
      .storage.from(BUCKET)
      .upload(thumbPath, thumb, { contentType: "image/jpeg", upsert: true });
    return error ? null : thumbPath;
  } catch {
    return null;
  }
}

// Photos from before 00105 have no thumbnail. A parent's device makes them in
// the background, a few at a time, from the picture it already has (the
// service worker's copy, so it costs no extra download once seen). Owners
// only: the kid guard pins thumb_path (00105) and the storage write is open
// to both, but one device doing it is enough.
const BACKFILL_BATCH = 40;
let backfillRunning = false;

/** Makes missing thumbnails for `photos` (owner devices). Fire and forget. */
export async function backfillThumbnails(photos: PhotoWithUrl[]): Promise<void> {
  if (backfillRunning || typeof document === "undefined") return;
  const todo = photos.filter((p) => !p.thumb_path && p.url).slice(0, BACKFILL_BATCH);
  if (todo.length === 0) return;
  backfillRunning = true;
  try {
    const supabase = requireClient();
    for (const photo of todo) {
      const picturePath = photo.media_type === "video" ? photo.poster_path : photo.file_path;
      if (!picturePath || !photo.url) continue;
      try {
        const res = await fetch(photo.url);
        if (!res.ok) continue;
        const thumbPath = await uploadThumbnail(picturePath, await res.blob());
        if (!thumbPath) continue;
        await supabase.from("photos").update({ thumb_path: thumbPath }).eq("id", photo.id).is("thumb_path", null);
      } catch {
        // offline or a bad file: the next visit tries again
      }
    }
  } finally {
    backfillRunning = false;
  }
}

/** All family-visible photos with signed URLs (RLS scopes rows by role).
 *  Album photos (00087, #58) belong to their album only and are left out
 *  unless asked for: the photos screen needs them for its albums and its
 *  approval queue. */
export async function listPhotos(
  tripId: string,
  opts: { albums?: "exclude" | "include" | "only" } = {}
): Promise<PhotoWithUrl[]> {
  const supabase = requireClient();
  let query = supabase.from("photos").select("*").eq("trip_id", tripId);
  const albums = opts.albums ?? "exclude";
  if (albums === "exclude") query = query.is("album_id", null);
  else if (albums === "only") query = query.not("album_id", "is", null);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return signFamilyMedia(data);
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
  /** [] = every guest once shared; else only these groups (00063/00064).
   *  Sharing stays a parent's separate step (#5). */
  audience?: string[];
  /** upload into this album (00087): the photo belongs to it only */
  albumId?: string | null;
  /** a parent's upload into a shared album is the share step itself
   *  (Hadar 09/11/2026, #58); ignored for kids by the 00001 trigger */
  share?: boolean;
}): Promise<Photo> {
  const supabase = requireClient();
  // the day it was taken, not the day it was uploaded; the canvas drops EXIF
  const [blob, shotOn] = await Promise.all([compressImage(input.file), photoTakenOn(input.file)]);
  const today = todayISO();
  const path = `${input.tripId}/${crypto.randomUUID()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: "image/jpeg" });
  if (uploadError) throw new Error(uploadError.message);
  const thumbPath = await uploadThumbnail(path, blob);

  const { data, error } = await supabase
    .from("photos")
    .insert({
      trip_id: input.tripId,
      uploaded_by: input.memberId,
      file_path: path,
      thumb_path: thumbPath,
      caption: input.caption?.trim() || null,
      taken_on: shotOn && shotOn <= today ? shotOn : today,
      audience: input.audience ?? [],
      album_id: input.albumId ?? null,
      ...(input.isOwner
        ? { status: "approved" as const, approved_by: input.memberId, shared_with_guests: input.share === true }
        : {}),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * A short video for an update (00099): checked and shrunk on the device
 * (lib/video.ts), then the file and its poster frame go to the same private
 * bucket and one `photos` row with media_type 'video'. Everything after that
 * is a photo's path: a kid's lands pending and unshared (00001 trigger), a
 * parent's is approved, sharing with guests stays its own step (#5).
 * Throws VideoError (too long / too big / unreadable) before any upload.
 */
export async function uploadVideo(input: {
  tripId: string;
  memberId: string;
  isOwner: boolean;
  file: File;
  /** 0..1 while the device re-encodes; the upload itself has no progress */
  onProgress?: (fraction: number) => void;
  onUploading?: () => void;
}): Promise<Photo> {
  const supabase = requireClient();
  const video = await prepareVideo(input.file, input.onProgress);
  input.onUploading?.();
  const base = `${input.tripId}/${crypto.randomUUID()}`;
  const path = `${base}.${video.ext}`;
  const posterPath = `${base}.poster.jpg`;

  const { error: posterError } = await supabase.storage
    .from(BUCKET)
    .upload(posterPath, video.poster, { contentType: "image/jpeg" });
  if (posterError) throw new Error(posterError.message);
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, video.blob, { contentType: video.contentType });
  if (uploadError) throw new Error(uploadError.message);
  const thumbPath = await uploadThumbnail(posterPath, video.poster);

  const { data, error } = await supabase
    .from("photos")
    .insert({
      trip_id: input.tripId,
      uploaded_by: input.memberId,
      file_path: path,
      media_type: "video",
      poster_path: posterPath,
      thumb_path: thumbPath,
      duration_seconds: Math.round(video.durationSeconds),
      taken_on: videoDay(input.file.lastModified, todayISO()),
      ...(input.isOwner ? { status: "approved" as const, approved_by: input.memberId } : {}),
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

/** Move a photo to another day, and so to that day's place (Hadar
 *  05/11/2026). Owners only: photos_guard_update pins it for kids (00084). */
export async function setPhotoDate(id: string, date: string): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("bad date");
  const { error } = await requireClient().from("photos").update({ taken_on: date }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Free text, no length limit. RLS: owner any photo, kid only their own
 *  (photos_kid_update_own; photos_guard_update pins everything else). */
export async function updatePhotoCaption(id: string, caption: string): Promise<void> {
  const { error } = await requireClient()
    .from("photos")
    .update({ caption: caption.trim() || null })
    .eq("id", id);
  if (error) throw new Error(error.message);
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
  // a video's poster goes with it (00099)
  await supabase.storage
    .from(BUCKET)
    .remove([photo.file_path, photo.poster_path, photo.thumb_path].filter((p): p is string => !!p));
}
