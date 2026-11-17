// Guest media for stories and the podcast (migrations 00043/00044). Same
// pattern as guest-photos: guests never read the `photos` or `audio` buckets
// directly. The caller names the photos / episodes it wants; this function
// looks them up through the CALLER's own JWT, so RLS decides which exist
// (for a guest: photos approved AND shared, episodes approved AND shared),
// and only those get short-lived signed URLs minted with the service role.
// An id the caller may not see simply comes back missing. verify_jwt=true.
//
// A video (00099) is a `photos` row like any other, so the same lookup
// decides it. `url` is always a picture - the photo, or the video's poster
// frame - and `video_url` is the video itself, null for a photo.

import { createClient } from "npm:@supabase/supabase-js@2";

// Signed URLs need no auth once minted and can be forwarded. Photos keep the
// 15 minutes guest-photos uses (review finding L3); audio gets a little more
// so a paused episode still plays on return.
const PHOTO_TTL_SECONDS = 15 * 60;
const AUDIO_TTL_SECONDS = 30 * 60;
// a video is played, not just shown: the same room as audio
const VIDEO_TTL_SECONDS = 30 * 60;
const MAX_IDS = 100;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function ids(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === "string" && UUID.test(v)))].slice(0, MAX_IDS);
}

type PhotoRow = { id: string; file_path: string; media_type: string; poster_path: string | null };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let body: { photo_ids?: unknown; episode_ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad request" }, 400);
  }
  const photoIds = ids(body.photo_ids);
  const episodeIds = ids(body.episode_ids);

  const caller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
  );

  // rows come through the caller's own JWT → RLS decides what exists
  const [photosRes, episodesRes] = await Promise.all([
    photoIds.length
      ? caller.from("photos").select("id, file_path, media_type, poster_path").in("id", photoIds)
      : Promise.resolve({ data: [] as PhotoRow[], error: null }),
    episodeIds.length
      ? caller.from("episodes").select("id, file_path").in("id", episodeIds)
      : Promise.resolve({ data: [] as { id: string; file_path: string }[], error: null }),
  ]);
  if (photosRes.error || episodesRes.error) {
    return json({ ok: false, error: (photosRes.error ?? episodesRes.error)!.message }, 500);
  }
  const photos = (photosRes.data ?? []) as PhotoRow[];
  const episodes = episodesRes.data ?? [];

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const sign = async (bucket: string, rows: { id: string; file_path: string }[], ttl: number) => {
    if (rows.length === 0) return [];
    const { data, error } = await service.storage
      .from(bucket)
      .createSignedUrls(rows.map((r) => r.file_path), ttl);
    if (error) throw error;
    const byPath = new Map((data ?? []).map((s) => [s.path, s.signedUrl]));
    return rows.map((r) => ({ id: r.id, url: byPath.get(r.file_path) ?? null }));
  };

  const signPaths = async (paths: string[], ttl: number) => {
    if (paths.length === 0) return new Map<string, string>();
    const { data, error } = await service.storage.from("photos").createSignedUrls(paths, ttl);
    if (error) throw error;
    return new Map((data ?? []).map((s) => [s.path, s.signedUrl]));
  };
  const signPhotos = async () => {
    const isVideo = (p: PhotoRow) => p.media_type === "video";
    const [pictures, videos] = await Promise.all([
      signPaths(
        photos.flatMap((p) => (isVideo(p) ? (p.poster_path ? [p.poster_path] : []) : [p.file_path])),
        PHOTO_TTL_SECONDS
      ),
      signPaths(photos.filter(isVideo).map((p) => p.file_path), VIDEO_TTL_SECONDS),
    ]);
    return photos.map((p) =>
      isVideo(p)
        ? { id: p.id, url: (p.poster_path && pictures.get(p.poster_path)) || null, video_url: videos.get(p.file_path) ?? null }
        : { id: p.id, url: pictures.get(p.file_path) ?? null, video_url: null }
    );
  };

  try {
    return json({
      ok: true,
      photos: await signPhotos(),
      episodes: await sign("audio", episodes, AUDIO_TTL_SECONDS),
    });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
