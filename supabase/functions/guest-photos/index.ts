// Guest photo access (SCHEMA storage plan): guests never read the photos
// bucket directly. This function lists the photos the CALLER's own RLS
// allows (for guests that is exactly status='approved' AND
// shared_with_guests=true) and returns short-lived signed URLs minted with
// the service role. verify_jwt=true.

import { createClient } from "npm:@supabase/supabase-js@2";

// Signed URLs need no auth once minted, so a guest can forward one to anyone.
// An hour was a wide window for photos of the kids; 15 minutes still covers a
// gallery load with room to spare (review finding L3).
const SIGNED_URL_TTL_SECONDS = 15 * 60;

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
    .select("id, file_path, caption, taken_on")
    .order("taken_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return json({ ok: false, error: error.message }, 500);
  if (!photos || photos.length === 0) return json({ ok: true, photos: [] });

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data: signed, error: signError } = await service.storage
    .from("photos")
    .createSignedUrls(photos.map((p) => p.file_path), SIGNED_URL_TTL_SECONDS);
  if (signError) return json({ ok: false, error: signError.message }, 500);

  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return json({
    ok: true,
    photos: photos.map((p) => ({
      id: p.id,
      caption: p.caption,
      taken_on: p.taken_on,
      url: urlByPath.get(p.file_path) ?? null,
    })),
  });
});
