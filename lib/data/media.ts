// Signed URLs for story photos and podcast audio, by role.
//
// Owners and kids read the private `photos` / `audio` buckets directly (their
// storage policies allow it). Guests never do: they go through the
// guest-media Edge Function, which looks the ids up under the guest's own RLS
// and signs only what comes back (approved AND shared). Either way an id the
// caller may not see returns no URL.

import { getSupabase } from "@/lib/supabase";
import { signFamilyMedia } from "@/lib/data/photos";
import type { MemberRole } from "@/lib/types";

const FAMILY_TTL_SECONDS = 60 * 60;

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

type UrlMap = Map<string, string | null>;
/** `url` is always a picture: the photo, or a video's poster frame (00099).
 *  `videoUrl` is the video itself, null for a photo. */
export type PhotoMedia = { url: string | null; videoUrl: string | null };
type MediaMap = Map<string, PhotoMedia>;

async function familySignEpisodes(ids: string[]): Promise<UrlMap> {
  const supabase = requireClient();
  const { data, error } = await supabase.from("episodes").select("id, file_path").in("id", ids);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return new Map();
  const { data: signed } = await supabase.storage
    .from("audio")
    .createSignedUrls(data.map((r) => r.file_path), FAMILY_TTL_SECONDS);
  const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl ?? null]));
  return new Map(data.map((r) => [r.id, byPath.get(r.file_path) ?? null]));
}

async function familySignPhotos(ids: string[]): Promise<MediaMap> {
  const { data, error } = await requireClient()
    .from("photos")
    .select("id, file_path, media_type, poster_path")
    .in("id", ids);
  if (error) throw new Error(error.message);
  const signed = await signFamilyMedia(data ?? [], FAMILY_TTL_SECONDS);
  return new Map(signed.map((r) => [r.id, { url: r.url, videoUrl: r.videoUrl }]));
}

async function guestSign(photoIds: string[], episodeIds: string[]): Promise<{ photos: MediaMap; episodes: UrlMap }> {
  const { data, error } = await requireClient().functions.invoke("guest-media", {
    body: { photo_ids: photoIds, episode_ids: episodeIds },
  });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.error ?? "failed");
  const toMap = (rows: { id: string; url: string | null }[]) => new Map(rows.map((r) => [r.id, r.url]));
  const photos = (data.photos ?? []) as { id: string; url: string | null; video_url?: string | null }[];
  return {
    photos: new Map(photos.map((r) => [r.id, { url: r.url, videoUrl: r.video_url ?? null }])),
    episodes: toMap(data.episodes ?? []),
  };
}

/** Each photo's picture and, for a video, the video (00099). */
export async function photoMedia(role: MemberRole | undefined, ids: string[]): Promise<MediaMap> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  if (role === "guest") return (await guestSign(unique, [])).photos;
  return familySignPhotos(unique);
}

/** The picture only: a photo, or a video's poster frame. */
export async function photoUrls(role: MemberRole | undefined, ids: string[]): Promise<UrlMap> {
  const media = await photoMedia(role, ids);
  return new Map([...media].map(([id, m]) => [id, m.url]));
}

export async function episodeUrls(role: MemberRole | undefined, ids: string[]): Promise<UrlMap> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  if (role === "guest") return (await guestSign([], unique)).episodes;
  return familySignEpisodes(unique);
}
