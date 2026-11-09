import { getSupabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";

// Photo albums by theme (00087, DECISIONS #58). An album is a label: a photo
// stays in the place grid and may be in several albums. RLS decides what
// exists for each role; for a guest, album_photos returns only rows whose
// photo is already visible under rule 3, so nothing here can widen a photo.

export type Album = Tables<"albums">;
export type AlbumPhoto = Tables<"album_photos">;

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

/** The albums the caller may see, newest first, with their photo links. */
export async function listAlbums(tripId: string): Promise<{ albums: Album[]; links: AlbumPhoto[] }> {
  const supabase = requireClient();
  const [albums, links] = await Promise.all([
    supabase.from("albums").select("*").eq("trip_id", tripId).order("created_at", { ascending: false }),
    supabase.from("album_photos").select("*").order("created_at", { ascending: false }),
  ]);
  if (albums.error) throw new Error(albums.error.message);
  if (links.error) throw new Error(links.error.message);
  const ids = new Set(albums.data.map((a) => a.id));
  return { albums: albums.data, links: links.data.filter((l) => ids.has(l.album_id)) };
}

/** Parents only (albums_owner_all). */
export async function createAlbum(input: { tripId: string; memberId: string; name: string }): Promise<Album> {
  const { data, error } = await requireClient()
    .from("albums")
    .insert({ trip_id: input.tripId, created_by: input.memberId, name: input.name.trim() })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function renameAlbum(id: string, name: string): Promise<void> {
  const { error } = await requireClient().from("albums").update({ name: name.trim() }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** The album itself; its photos still need their own share (rule 3). */
export async function setAlbumShared(id: string, shared: boolean): Promise<void> {
  const { error } = await requireClient().from("albums").update({ shared_with_guests: shared }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Deletes the album and its links; the photos stay. */
export async function deleteAlbum(id: string): Promise<void> {
  const { error } = await requireClient().from("albums").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Parents and kids; a photo already in the album is skipped. */
export async function addToAlbum(albumId: string, photoIds: string[], memberId: string): Promise<void> {
  if (photoIds.length === 0) return;
  const { error } = await requireClient()
    .from("album_photos")
    .upsert(
      photoIds.map((photo_id) => ({ album_id: albumId, photo_id, added_by: memberId })),
      { onConflict: "album_id,photo_id", ignoreDuplicates: true }
    );
  if (error) throw new Error(error.message);
}

/** Parents any photo, a kid only what they added (RLS). */
export async function removeFromAlbum(albumId: string, photoId: string): Promise<void> {
  const { error } = await requireClient()
    .from("album_photos")
    .delete()
    .eq("album_id", albumId)
    .eq("photo_id", photoId);
  if (error) throw new Error(error.message);
}
