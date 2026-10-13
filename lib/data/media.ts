// Signed URLs for story photos and podcast audio, by role.
//
// Owners and kids read the private `photos` / `audio` buckets directly (their
// storage policies allow it). Guests never do: they go through the
// guest-media Edge Function, which looks the ids up under the guest's own RLS
// and signs only what comes back (approved AND shared). Either way an id the
// caller may not see returns no URL.

import { getSupabase } from "@/lib/supabase";
import type { MemberRole } from "@/lib/types";

const FAMILY_TTL_SECONDS = 60 * 60;

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

type UrlMap = Map<string, string | null>;

async function familySign(
  table: "photos" | "episodes",
  bucket: "photos" | "audio",
  ids: string[]
): Promise<UrlMap> {
  const supabase = requireClient();
  const { data, error } = await supabase.from(table).select("id, file_path").in("id", ids);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return new Map();
  const { data: signed } = await supabase.storage
    .from(bucket)
    .createSignedUrls(data.map((r) => r.file_path), FAMILY_TTL_SECONDS);
  const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl ?? null]));
  return new Map(data.map((r) => [r.id, byPath.get(r.file_path) ?? null]));
}

async function guestSign(photoIds: string[], episodeIds: string[]): Promise<{ photos: UrlMap; episodes: UrlMap }> {
  const { data, error } = await requireClient().functions.invoke("guest-media", {
    body: { photo_ids: photoIds, episode_ids: episodeIds },
  });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.error ?? "failed");
  const toMap = (rows: { id: string; url: string | null }[]) => new Map(rows.map((r) => [r.id, r.url]));
  return { photos: toMap(data.photos ?? []), episodes: toMap(data.episodes ?? []) };
}

export async function photoUrls(role: MemberRole | undefined, ids: string[]): Promise<UrlMap> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  if (role === "guest") return (await guestSign(unique, [])).photos;
  return familySign("photos", "photos", unique);
}

export async function episodeUrls(role: MemberRole | undefined, ids: string[]): Promise<UrlMap> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  if (role === "guest") return (await guestSign([], unique)).episodes;
  return familySign("episodes", "audio", unique);
}
