// Turns the names in the options bank into coordinates, so the bank can be
// drawn on a map.
//
// WHY THIS IS A SEPARATE STEP: extract-places gets its places out of post text,
// which gives names and nothing else — "Roving chill house", "Slow cafe". A map
// needs lat/lng, so somebody has to resolve one into the other. Doing it during
// extraction would make that call slow and would geocode places the owner then
// discards, so it happens here, after saving, over the rows that still have no
// coordinates.
//
// PROVIDER ORDER mirrors `recommend`: Google Geocoding when GOOGLE_MAPS_API_KEY
// is set (fast, and the key already exists for the recommender), otherwise
// keyless OpenStreetMap/Nominatim. Nominatim asks callers to stay at roughly
// one request a second and to identify themselves, so that path is throttled
// and sends a User-Agent. Either way this is best-effort: a place that cannot
// be resolved keeps its null coordinates and simply does not appear as a pin.
//
// Owner-gated (deployed verify_jwt=true; additionally re-checks role='owner'
// in-function). The gate runs BEFORE input validation, as in extract-places.
//
// Reads and writes go through the CALLER's client, not the service role, so
// RLS still decides which rows are touchable — this function cannot reach
// another trip's options even if it is handed their ids.

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

// Bounded so one invocation always finishes well inside the function timeout,
// even on the throttled keyless path. The client calls again while work remains
// and shows progress, rather than this blocking for minutes.
const BATCH = 20;
const NOMINATIM_DELAY_MS = 1100;

type Row = {
  id: string;
  title: string;
  area: string | null;
  country: string | null;
};

type Coords = { lat: number; lng: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The same query the client builds for its Maps search link: name, then the
 *  area and country that disambiguate it. "Slow cafe" alone is hopeless;
 *  "Slow cafe Hội An Vietnam" is not. */
function queryFor(row: Row): string {
  return [row.title, row.area, row.country]
    .map((p) => p?.trim())
    .filter((p): p is string => !!p)
    .join(", ");
}

async function geocodeGoogle(query: string, key: string): Promise<Coords | null> {
  try {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json` +
      `?address=${encodeURIComponent(query)}&key=${key}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const loc = data?.results?.[0]?.geometry?.location;
    if (typeof loc?.lat !== "number" || typeof loc?.lng !== "number") return null;
    return { lat: loc.lat, lng: loc.lng };
  } catch {
    return null;
  }
}

async function geocodeNominatim(query: string): Promise<Coords | null> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/search?format=json&limit=1` +
      `&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "OurTrip/1.0 (family trip planner)" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const hit = data?.[0];
    const lat = Number(hit?.lat);
    const lng = Number(hit?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  const caller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: {
        headers: { Authorization: req.headers.get("Authorization") ?? "" },
      },
    }
  );

  // ---- owner gate FIRST ----
  const { data: role } = await caller.rpc("current_member_role");
  if (role !== "owner") return json({ ok: false, error: "forbidden" }, 403);

  let body: { trip_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad request" }, 400);
  }
  const tripId = (body.trip_id ?? "").trim();
  if (tripId === "") return json({ ok: false, error: "trip required" }, 400);

  // RLS scopes this to the caller's own trip regardless of what id is passed.
  const { data: rows, error: readError } = await caller
    .from("place_options")
    .select("id, title, area, country")
    .eq("trip_id", tripId)
    .is("lat", null)
    .limit(BATCH);

  if (readError) {
    console.error("geocode-places: read failed:", readError.message);
    return json({ ok: false, error: "read_failed" }, 502);
  }

  const pending = (rows ?? []) as Row[];
  if (pending.length === 0) {
    return json({ ok: true, located: 0, failed: 0, remaining: 0 });
  }

  const googleKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  let located = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i++) {
    const row = pending[i];
    const query = queryFor(row);

    const coords = googleKey
      ? await geocodeGoogle(query, googleKey)
      : await geocodeNominatim(query);

    if (!coords) {
      failed++;
    } else {
      const { error: writeError } = await caller
        .from("place_options")
        .update({ lat: coords.lat, lng: coords.lng })
        .eq("id", row.id);
      if (writeError) {
        console.error(
          `geocode-places: write failed for ${row.id}:`,
          writeError.message
        );
        failed++;
      } else {
        located++;
      }
    }

    // Nominatim's usage policy asks for ~1 request/second. Skip the wait after
    // the last row, and skip it entirely on the Google path.
    if (!googleKey && i < pending.length - 1) await sleep(NOMINATIM_DELAY_MS);
  }

  // How many still have no coordinates, so the client knows whether to call
  // again. Rows that just failed are included — they are retried on a later
  // run, since a failure is usually a thin query rather than a permanent one.
  const { count } = await caller
    .from("place_options")
    .select("id", { count: "exact", head: true })
    .eq("trip_id", tripId)
    .is("lat", null);

  console.log(
    `geocode-places: ${located} located, ${failed} failed, ${count ?? 0} remaining ` +
      `(provider: ${googleKey ? "google" : "nominatim"})`
  );

  return json({ ok: true, located, failed, remaining: count ?? 0 });
});
