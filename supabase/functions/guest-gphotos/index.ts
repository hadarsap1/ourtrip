// Guest access to owner-shared Google Photos. Guests never read the gphotos
// bucket directly: this lists the rows the CALLER's own RLS allows (for guests
// that is exactly shared_with_guests=true) and returns short-lived signed URLs
// minted with the service role. Mirrors guest-photos. verify_jwt=true.

import { createClient } from "npm:@supabase/supabase-js@2";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const caller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
  );

  // rows come through the caller's JWT → RLS decides what exists
  const { data: photos, error } = await caller
    .from("google_photos")
    .select("id, file_path, country, area, filename, taken_at")
    .order("country", { ascending: true, nullsFirst: false })
    .order("area", { ascending: true, nullsFirst: false })
    .order("taken_at", { ascending: false, nullsFirst: false });
  if (error) return json({ ok: false, error: error.message }, 500);
  if (!photos || photos.length === 0) return json({ ok: true, photos: [] });

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data: signed, error: signError } = await service.storage
    .from("gphotos")
    .createSignedUrls(photos.map((p) => p.file_path), 60 * 60);
  if (signError) return json({ ok: false, error: signError.message }, 500);

  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return json({
    ok: true,
    photos: photos.map((p) => ({
      id: p.id,
      country: p.country,
      area: p.area,
      filename: p.filename,
      url: urlByPath.get(p.file_path) ?? null,
    })),
  });
});
