// Guest access to owner-shared Google Photos. Guests never read the gphotos
// bucket directly: this lists the rows the CALLER's own RLS allows (for guests
// that is exactly shared_with_guests=true) and returns short-lived signed URLs
// minted with the service role. Mirrors guest-photos. verify_jwt=true.

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

  // rows come through the caller's JWT → RLS decides what exists
  const { data: photos, error } = await caller
    .from("google_photos")
    // "*" rather than a column list so this keeps working on a database
    // without thumb_path (before 00106); the reply names only what guests see
    .select("*")
    .order("country", { ascending: true, nullsFirst: false })
    .order("area", { ascending: true, nullsFirst: false })
    .order("taken_at", { ascending: false, nullsFirst: false });
  if (error) {
    console.error(`guest-gphotos: lookup failed: ${error.message}`);
    return json({ ok: false, error: "lookup_failed" }, 500);
  }
  if (!photos || photos.length === 0) return json({ ok: true, photos: [] });

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  // the small tile copy (00106) is signed too, so the gallery grid never
  // pulls the full display copy; a photo without one falls back to it
  const rows = photos as { id: string; file_path: string; thumb_path?: string | null; country: string | null; area: string | null; filename: string | null }[];
  const paths = rows.flatMap((p) => [p.file_path, p.thumb_path].filter((x): x is string => !!x));
  const { data: signed, error: signError } = await service.storage
    .from("gphotos")
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (signError) {
    console.error(`guest-gphotos: signing failed: ${signError.message}`);
    return json({ ok: false, error: "sign_failed" }, 500);
  }

  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return json({
    ok: true,
    photos: rows.map((p) => ({
      id: p.id,
      country: p.country,
      area: p.area,
      filename: p.filename,
      url: urlByPath.get(p.file_path) ?? null,
      thumb_url: p.thumb_path ? (urlByPath.get(p.thumb_path) ?? null) : null,
    })),
  });
});
