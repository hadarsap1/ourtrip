import { getSupabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";

export type GooglePhoto = Tables<"google_photos">;
export type GooglePhotoWithUrl = GooglePhoto & { url: string | null };

const BUCKET = "gphotos";

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

/** All imported Google photos for the trip, each with a signed display URL.
 *  RLS scopes rows by role (owner + kids). */
export async function listGooglePhotos(
  tripId: string
): Promise<GooglePhotoWithUrl[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("google_photos")
    .select("*")
    .eq("trip_id", tripId)
    .order("country", { ascending: true, nullsFirst: false })
    .order("area", { ascending: true, nullsFirst: false })
    .order("taken_at", { ascending: false, nullsFirst: false })
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

/** Removes the cached copy + row. The original stays in Google Photos. */
export async function deleteGooglePhoto(photo: GooglePhoto): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.from("google_photos").delete().eq("id", photo.id);
  if (error) throw new Error(error.message);
  await supabase.storage.from(BUCKET).remove([photo.file_path]);
}
