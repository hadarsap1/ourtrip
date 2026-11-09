import { getSupabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";
import { listSeen, markSeen } from "@/lib/data/feedback";

// Photo albums by theme (00087, DECISIONS #58). A photo uploaded into an
// album belongs to it only: it is not in the place grid, the updates or the
// home. RLS decides what exists: a guest reads a shared album only, and in it
// only photos that are approved AND shared AND in their group (rule 3).

export type Album = Tables<"albums">;

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

/** The albums the caller may see, newest first. */
export async function listAlbums(tripId: string): Promise<Album[]> {
  const { data, error } = await requireClient()
    .from("albums")
    .select("*")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
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

/** Unsharing hides every photo in the album from guests at once (RLS). */
export async function setAlbumShared(id: string, shared: boolean): Promise<void> {
  const { error } = await requireClient().from("albums").update({ shared_with_guests: shared }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Deletes the album with its photos (rows cascade; files removed here). */
export async function deleteAlbum(id: string): Promise<void> {
  const supabase = requireClient();
  const { data: photos } = await supabase.from("photos").select("file_path").eq("album_id", id);
  const { error } = await supabase.from("albums").delete().eq("id", id);
  if (error) throw new Error(error.message);
  const paths = (photos ?? []).map((p) => p.file_path);
  if (paths.length > 0) await supabase.storage.from("photos").remove(paths);
}

// ---------- "new" in the album (the in-app notification, no push) ----------

/** With no "last looked" yet, the last week counts as new (as 00081). */
const NO_SEEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type AlbumNews = {
  albums: Album[];
  /** album id -> photos added since I last opened it (not my own) */
  fresh: Map<string, number>;
};

/**
 * What is new in each album for me. A photo counts from when it became
 * visible to guests in the album (album_shared_at, set by the 00087 trigger)
 * or, for the family, from its upload. RLS returns only what I may see.
 */
export async function loadAlbumNews(tripId: string, memberId: string): Promise<AlbumNews> {
  const supabase = requireClient();
  const [albums, photos, seen] = await Promise.all([
    listAlbums(tripId),
    supabase
      .from("photos")
      .select("album_id, uploaded_by, status, created_at, album_shared_at")
      .eq("trip_id", tripId)
      .not("album_id", "is", null),
    listSeen().catch(() => new Map<string, string>()),
  ]);
  if (photos.error) throw new Error(photos.error.message);
  const since = (albumId: string) => {
    const at = seen.get(albumId);
    return at ? Date.parse(at) : Date.now() - NO_SEEN_WINDOW_MS;
  };
  const fresh = new Map<string, number>();
  for (const p of photos.data) {
    if (!p.album_id || p.uploaded_by === memberId || p.status === "rejected") continue;
    const at = Date.parse(p.album_shared_at ?? p.created_at);
    if (at > since(p.album_id)) fresh.set(p.album_id, (fresh.get(p.album_id) ?? 0) + 1);
  }
  return { albums, fresh };
}

/** Opening an album clears its "new". */
export async function markAlbumSeen(memberId: string, albumId: string): Promise<void> {
  await markSeen(memberId, [albumId], new Date().toISOString());
}
