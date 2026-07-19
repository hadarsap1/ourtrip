// Google Photos import via the official Picker API (photospicker.googleapis.com).
// Google removed third-party library/album read access on 2025-03-31; the
// Picker is the only sanctioned path. All Google calls run here (server-side)
// to avoid browser CORS on both the API and the lh3.googleusercontent.com
// image bytes. Owner-gated (verify_jwt=true + in-function role check).
//
// The owner's Google access token (photospicker.mediaitems.readonly scope) is
// obtained in the browser via Google Identity Services and passed in the body.
// It is used transiently for this request only and never stored.
//
// Actions:
//   create  -> POST a picking session; returns { sessionId, pickerUri, pollSeconds }
//   poll    -> GET the session; returns { mediaItemsSet }
//   import  -> list picked items, download display-sized copies, cache them in
//              the 'gphotos' bucket, insert google_photos rows. { imported, skipped }

import { createClient } from "npm:@supabase/supabase-js@2";

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

const PICKER = "https://photospicker.googleapis.com/v1";

type Body = {
  action?: "create" | "poll" | "import";
  googleToken?: string;
  sessionId?: string;
  country?: string | null;
  area?: string | null;
};

/** auth.uid() from the already-verified bearer token (verify_jwt=true). */
function callerAuthUid(req: Request): string | null {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
    );
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

function pollSeconds(pollInterval: unknown): number {
  const s = typeof pollInterval === "string" ? parseFloat(pollInterval) : NaN;
  return Number.isFinite(s) && s > 0 ? Math.min(Math.max(s, 2), 15) : 5;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad request" }, 400);
  }
  const { action, googleToken } = body;
  if (!action || !googleToken) {
    return json({ ok: false, error: "missing action or token" }, 400);
  }

  // owner gate
  const caller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
  );
  const { data: role } = await caller.rpc("current_member_role");
  if (role !== "owner") return json({ ok: false, error: "forbidden" }, 403);

  const gHeaders = { Authorization: `Bearer ${googleToken}` };

  // ---------- create session ----------
  if (action === "create") {
    const res = await fetch(`${PICKER}/sessions`, {
      method: "POST",
      headers: { ...gHeaders, "content-type": "application/json" },
      body: "{}",
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("gphotos create session failed:", res.status, text);
      return json({ ok: false, error: "google_auth_failed" }, 502);
    }
    const session = await res.json();
    return json({
      ok: true,
      sessionId: session.id,
      pickerUri: session.pickerUri,
      pollSeconds: pollSeconds(session.pollingConfig?.pollInterval),
    });
  }

  // ---------- poll session ----------
  if (action === "poll") {
    if (!body.sessionId) return json({ ok: false, error: "missing sessionId" }, 400);
    const res = await fetch(`${PICKER}/sessions/${body.sessionId}`, { headers: gHeaders });
    if (!res.ok) return json({ ok: false, error: "poll_failed" }, 502);
    const session = await res.json();
    return json({
      ok: true,
      mediaItemsSet: Boolean(session.mediaItemsSet),
      pollSeconds: pollSeconds(session.pollingConfig?.pollInterval),
    });
  }

  // ---------- import ----------
  if (action !== "import" || !body.sessionId) {
    return json({ ok: false, error: "missing sessionId" }, 400);
  }

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: trip } = await service
    .from("trips")
    .select("id")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!trip) return json({ ok: false, error: "no active trip" }, 409);

  // resolve the owner's member id for created_by
  const authUid = callerAuthUid(req);
  let createdBy: string | null = null;
  if (authUid) {
    const { data: me } = await service
      .from("members")
      .select("id")
      .eq("auth_user_id", authUid)
      .maybeSingle();
    createdBy = me?.id ?? null;
  }

  const country = (body.country ?? "")?.toString().trim() || null;
  const area = (body.area ?? "")?.toString().trim() || null;

  // list all picked items (paginated)
  type PickedItem = {
    id: string;
    createTime?: string;
    type?: string;
    mediaFile?: {
      baseUrl?: string;
      mimeType?: string;
      filename?: string;
      mediaFileMetadata?: { width?: number; height?: number };
    };
  };
  const items: PickedItem[] = [];
  let pageToken = "";
  for (let guard = 0; guard < 50; guard++) {
    const url = new URL(`${PICKER}/mediaItems`);
    url.searchParams.set("sessionId", body.sessionId);
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url.toString(), { headers: gHeaders });
    if (!res.ok) {
      const text = await res.text();
      console.error("gphotos list mediaItems failed:", res.status, text);
      return json({ ok: false, error: "list_failed" }, 502);
    }
    const page = await res.json();
    for (const it of page.mediaItems ?? []) items.push(it as PickedItem);
    pageToken = page.nextPageToken ?? "";
    if (!pageToken) break;
  }

  let imported = 0;
  let skipped = 0;
  for (const item of items) {
    const file = item.mediaFile;
    // photos only (skip video); Picker "type" is PHOTO / VIDEO
    if (!file?.baseUrl || (item.type && item.type !== "PHOTO")) {
      skipped++;
      continue;
    }

    // dedup: same Google media already imported for this trip
    const { data: dup } = await service
      .from("google_photos")
      .select("id")
      .eq("trip_id", trip.id)
      .eq("google_media_id", item.id)
      .maybeSingle();
    if (dup) {
      skipped++;
      continue;
    }

    // download a display-sized copy (=w1600-h1600 keeps aspect ratio, no crop);
    // requires the Google bearer token.
    let bytes: ArrayBuffer;
    let contentType = "image/jpeg";
    try {
      const imgRes = await fetch(`${file.baseUrl}=w1600-h1600`, { headers: gHeaders });
      if (!imgRes.ok) {
        skipped++;
        continue;
      }
      contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
      if (!/^image\/(jpeg|png|webp)$/.test(contentType)) contentType = "image/jpeg";
      bytes = await imgRes.arrayBuffer();
    } catch {
      skipped++;
      continue;
    }

    const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    const path = `${trip.id}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await service.storage
      .from("gphotos")
      .upload(path, bytes, { contentType });
    if (upErr) {
      console.error("gphotos upload failed:", upErr.message);
      skipped++;
      continue;
    }

    const { error: insErr } = await service.from("google_photos").insert({
      trip_id: trip.id,
      google_media_id: item.id,
      country,
      area,
      file_path: path,
      filename: file.filename ?? null,
      width: file.mediaFileMetadata?.width ?? null,
      height: file.mediaFileMetadata?.height ?? null,
      taken_at: item.createTime ?? null,
      created_by: createdBy,
    });
    if (insErr) {
      // roll back the orphaned upload
      await service.storage.from("gphotos").remove([path]);
      console.error("gphotos insert failed:", insErr.message);
      skipped++;
      continue;
    }
    imported++;
  }

  // best-effort: end the picking session
  await fetch(`${PICKER}/sessions/${body.sessionId}`, {
    method: "DELETE",
    headers: gHeaders,
  }).catch(() => {});

  return json({ ok: true, imported, skipped });
});
