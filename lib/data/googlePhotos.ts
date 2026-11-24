import { getSupabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";
import { signPaths } from "@/lib/data/signedUrls";
import { makeThumbnail, thumbPathFor } from "@/lib/images";

export type GooglePhoto = Tables<"google_photos">;
/** `url` is the cached display copy (opened full size); `thumbUrl` the small
 *  copy for tiles (00106), null until one is made: use `thumbUrl ?? url`. */
export type GooglePhotoWithUrl = GooglePhoto & { url: string | null; thumbUrl: string | null };

const BUCKET = "gphotos";
const SIGNED_TTL_SECONDS = 60 * 60;

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

/** Imported Google photos for the trip, each with signed display + tile URLs
 *  (reused while still good, so the browser and the service worker serve
 *  repeats from cache). RLS scopes rows by role (owner + kids).
 *  `pinnedOnly`: just the ones attached to a map pin (the map screen). */
export async function listGooglePhotos(
  tripId: string,
  opts: { pinnedOnly?: boolean } = {}
): Promise<GooglePhotoWithUrl[]> {
  const supabase = requireClient();
  let query = supabase.from("google_photos").select("*").eq("trip_id", tripId);
  if (opts.pinnedOnly) query = query.not("map_pin_id", "is", null);
  const { data, error } = await query
    .order("country", { ascending: true, nullsFirst: false })
    .order("area", { ascending: true, nullsFirst: false })
    .order("taken_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  if (data.length === 0) return [];

  // thumb_path is absent before 00106 is applied: read it as optional
  const rows = data as (GooglePhoto & { thumb_path?: string | null })[];
  const paths = rows.flatMap((p) => [p.file_path, p.thumb_path].filter((x): x is string => !!x));
  const urlByPath = await signPaths(BUCKET, paths, SIGNED_TTL_SECONDS);
  const at = (path: string | null | undefined) => (path ? (urlByPath.get(path) ?? null) : null);
  // the row is passed on as read: before 00106 it has no thumb_path key at
  // all, which is how the backfill knows not to write one yet
  return rows.map((p) => ({ ...p, url: at(p.file_path), thumbUrl: at(p.thumb_path) })) as GooglePhotoWithUrl[];
}

// Photos imported before 00106 have no thumbnail. A parent's device makes them
// in the background, a few at a time, from the copy it is already showing (the
// service worker's, so it costs no extra download once seen). Owners only:
// only they may write google_photos and the gphotos bucket (00016).
const BACKFILL_BATCH = 40;
let backfillRunning = false;

/** Makes missing thumbnails for `photos` (owner devices). Fire and forget. */
export async function backfillGoogleThumbnails(photos: GooglePhotoWithUrl[]): Promise<void> {
  if (backfillRunning || typeof document === "undefined") return;
  // `thumb_path` undefined = the column is not there yet (before 00106)
  const todo = photos.filter((p) => "thumb_path" in p && p.thumb_path === null && p.url).slice(0, BACKFILL_BATCH);
  if (todo.length === 0) return;
  backfillRunning = true;
  try {
    const supabase = requireClient();
    for (const photo of todo) {
      if (!photo.url) continue;
      try {
        const res = await fetch(photo.url);
        if (!res.ok) continue;
        const thumb = await makeThumbnail(await res.blob());
        const thumbPath = thumbPathFor(photo.file_path);
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(thumbPath, thumb, { contentType: "image/jpeg", upsert: true });
        if (upErr) continue;
        await supabase.from("google_photos").update({ thumb_path: thumbPath }).eq("id", photo.id).is("thumb_path", null);
      } catch {
        // offline or a bad file: the next visit tries again
      }
    }
  } finally {
    backfillRunning = false;
  }
}

/** A country/zone group of imported photos, for the grouped gallery. */
export type GooglePhotoGroup = {
  country: string | null;
  area: string | null;
  photos: GooglePhotoWithUrl[];
};

/** Groups photos by country then area, preserving the sorted order. */
export function groupGooglePhotos(
  photos: GooglePhotoWithUrl[]
): GooglePhotoGroup[] {
  const groups: GooglePhotoGroup[] = [];
  const index = new Map<string, GooglePhotoGroup>();
  for (const photo of photos) {
    const key = `${photo.country ?? ""}||${photo.area ?? ""}`;
    let group = index.get(key);
    if (!group) {
      group = { country: photo.country, area: photo.area, photos: [] };
      index.set(key, group);
      groups.push(group);
    }
    group.photos.push(photo);
  }
  return groups;
}

/** Re-file a photo under a different country / area (owner-only via RLS). */
export async function updateGooglePhotoGrouping(
  id: string,
  country: string | null,
  area: string | null
): Promise<void> {
  const { error } = await requireClient()
    .from("google_photos")
    .update({ country: country?.trim() || null, area: area?.trim() || null })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Owner: share / unshare a photo with guests (separate step, DECISIONS #5). */
export async function setGooglePhotoShared(
  id: string,
  shared: boolean
): Promise<void> {
  const { error } = await requireClient()
    .from("google_photos")
    .update({ shared_with_guests: shared })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Owner: attach a photo to a map pin (or detach with null) for the map. */
export async function setGooglePhotoPin(
  id: string,
  mapPinId: string | null
): Promise<void> {
  const { error } = await requireClient()
    .from("google_photos")
    .update({ map_pin_id: mapPinId })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Removes the cached copy + row. The original stays in Google Photos. */
export async function deleteGooglePhoto(photo: GooglePhoto): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.from("google_photos").delete().eq("id", photo.id);
  if (error) throw new Error(error.message);
  await supabase.storage.from(BUCKET).remove([photo.file_path, photo.thumb_path].filter((p): p is string => !!p));
}
