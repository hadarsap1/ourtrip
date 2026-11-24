// Guest photo access (SCHEMA storage plan): guests never read the photos
// bucket directly. This function lists the photos the CALLER's own RLS
// allows (for guests that is exactly status='approved' AND
// shared_with_guests=true) and returns short-lived signed URLs minted with
// the service role. verify_jwt=true.
//
// Each photo also carries where it was taken (Hadar 01/11/2026: the photos
// screen goes by place): the place name, country and city-level point of the
// itinerary day it was taken on. Only for the days of photos the caller may
// already see - a past day the family chose to share a photo from - never a
// day ahead or anything else about the day (00009 still hides the plan).

//
// A video (00099) is a `photos` row like any other, so the same RLS read
// decides it. `url` is always a picture - the photo, or the video's poster
// frame - and `video_url` is the video itself, null for a photo.

import { createClient } from "npm:@supabase/supabase-js@2";

// Signed URLs need no auth once minted, so a guest can forward one to anyone.
// An hour was a wide window for photos of the kids; 15 minutes still covers a
// gallery load with room to spare (review finding L3).
const SIGNED_URL_TTL_SECONDS = 15 * 60;
// a video is played, not just shown: the room guest-media gives audio
const VIDEO_TTL_SECONDS = 30 * 60;

// Browser calls this cross-origin (Vercel -> *.supabase.co), so every response
// - including the CORS preflight - must carry these headers. Without them the
// function still runs and still writes to the database; the browser simply
// refuses to hand the reply to the page, so supabase-js reports a network
// failure and the screen shows a generic "try again" that no retry can fix.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const caller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
  );

  // rows come through the caller's own JWT → RLS decides what exists
  const { data: photos, error } = await caller
    .from("photos")
    .select("id, trip_id, file_path, caption, taken_on, media_type, poster_path, thumb_path")
    .order("taken_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) {
    console.error(`guest-photos: lookup failed: ${error.message}`);
    return json({ ok: false, error: "lookup_failed" }, 500);
  }
  if (!photos || photos.length === 0) return json({ ok: true, photos: [] });

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const isVideo = (p: { media_type: string }) => p.media_type === "video";
  // each picture and its grid thumbnail (00105), only for rows RLS returned
  const picturePaths = photos.flatMap((p) =>
    [isVideo(p) ? p.poster_path : p.file_path, p.thumb_path].filter((x): x is string => !!x)
  );
  const videoPaths = photos.filter(isVideo).map((p) => p.file_path);
  const [signed, signedVideos] = await Promise.all([
    picturePaths.length
      ? service.storage.from("photos").createSignedUrls(picturePaths, SIGNED_URL_TTL_SECONDS)
      : Promise.resolve({ data: [], error: null }),
    videoPaths.length
      ? service.storage.from("photos").createSignedUrls(videoPaths, VIDEO_TTL_SECONDS)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const signError = signed.error ?? signedVideos.error;
  if (signError) {
    console.error(`guest-photos: signing failed: ${signError.message}`);
    return json({ ok: false, error: "sign_failed" }, 500);
  }

  const urlByPath = new Map(
    [...(signed.data ?? []), ...(signedVideos.data ?? [])].map((s) => [s.path, s.signedUrl])
  );

  // where: the day each photo was taken on. A failure here only drops the
  // place; the photos still load.
  const tripIds = [...new Set(photos.map((p) => p.trip_id))];
  const dates = [...new Set(photos.map((p) => p.taken_on))];
  const { data: days } = await service
    .from("itinerary_days")
    .select("trip_id, date, location_name, country_code, lat, lng")
    .in("trip_id", tripIds)
    .in("date", dates);
  // ~1 km is the city, not the hotel
  const round = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);
  const dayOf = new Map(
    (days ?? []).map((d) => [
      `${d.trip_id}|${d.date}`,
      { place: d.location_name, country_code: d.country_code, lat: round(d.lat), lng: round(d.lng) },
    ])
  );
  return json({
    ok: true,
    photos: photos.map((p) => ({
      id: p.id,
      caption: p.caption,
      taken_on: p.taken_on,
      url: (isVideo(p) ? p.poster_path && urlByPath.get(p.poster_path) : urlByPath.get(p.file_path)) || null,
      video_url: isVideo(p) ? (urlByPath.get(p.file_path) ?? null) : null,
      thumb_url: (p.thumb_path && urlByPath.get(p.thumb_path)) || null,
      ...(dayOf.get(`${p.trip_id}|${p.taken_on}`) ?? {
        place: null,
        country_code: null,
        lat: null,
        lng: null,
      }),
    })),
  });
});
