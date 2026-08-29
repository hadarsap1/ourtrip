// Turns the names in the options bank into coordinates, so the bank can be
// drawn on a map.
//
// WHY THIS IS A SEPARATE STEP: extract-places gets its places out of post text,
// which gives names and nothing else — "Roving Chill House", "Slow Cafe". A map
// needs lat/lng, so somebody has to resolve one into the other. Doing it during
// extraction would make that call slow and would geocode places the owner then
// discards, so it happens here, after saving, over the rows that still have no
// coordinates.
//
// PAGING (see migration 00028): a row that fails keeps its null coordinates, so
// selecting purely on `lat is null` handed every call the same first twenty
// rows forever. `geocode_attempts` is bumped on failure and the pending query
// skips rows that have used up their attempts, so each call takes fresh work.
//
// PROVIDER CHAIN, tried in order until one answers:
//   1. Google Places Text Search — the only one of the three that knows small
//      businesses. Most of this bank is cafés, homestays and boutique hotels
//      ("Naia Yoga+Cafe", "Manao Villas"), which is exactly what the previous
//      Geocoding-only path could not resolve: Geocoding resolves ADDRESSES, and
//      a business name is not an address, so it answered ZERO_RESULTS for them.
//   2. Google Geocoding — better for the bank's administrative entries
//      (a province, a national park, "Tam Tiến").
//   3. Keyless OpenStreetMap/Nominatim — the no-key fallback, and the last
//      resort when the Google calls fail. Nominatim asks callers to stay at
//      roughly one request a second and to identify themselves, so that path is
//      throttled and sends a User-Agent.
// Both Google APIs answer HTTP 200 with an error in the body, so `status` is
// checked and reported: a disabled API or a browser-restricted key used to look
// exactly like "this place does not exist" in the logs.
//
// QUERY LADDER: the bank's `country` is a free-text Hebrew label ("ויטנאם") and
// is sometimes plain wrong (Philippine resorts saved under Vietnam, because the
// extractor stamps the post's country hint on everything). So each row gets
// tried as "name, area, country" and then, if that misses, as "name, area" —
// which rescues a row whose country is wrong but whose area is right.
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
// After this many misses a row is left alone, so a handful of unresolvable
// names can never again soak up every batch. Clearing geocode_attempts re-queues
// a row, which is what the "try the stubborn ones again" path does.
const MAX_ATTEMPTS = 3;

type Row = {
  id: string;
  title: string;
  area: string | null;
  country: string | null;
  country_code: string | null;
  geocode_attempts: number;
};

type Hit = {
  lat: number;
  lng: number;
  /** Google only: lets the pin link straight to the business rather than a
   *  name search that may land on a different branch. */
  placeId?: string | null;
  /** What the provider says this place is called / where it is. Stored as
   *  location_name so a wrong pin is recognisable as wrong. */
  label?: string | null;
  provider: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The Hebrew country labels this bank actually uses, mapped to the English name
// and ISO code the geocoders want. Deliberately a small list of the trip's
// countries plus common spelling variants — "ויטנאם" (one yud) is what the
// extractor writes and it matches neither spelling in lib/importItinerary.ts.
// An unknown label is passed through unchanged: worse odds, never a crash.
const COUNTRY: Record<string, { name: string; code: string }> = {
  "ויטנאם": { name: "Vietnam", code: "VN" },
  "וייטנאם": { name: "Vietnam", code: "VN" },
  "ויאטנם": { name: "Vietnam", code: "VN" },
  "תאילנד": { name: "Thailand", code: "TH" },
  "תאילנד ": { name: "Thailand", code: "TH" },
  "יפן": { name: "Japan", code: "JP" },
  "פיליפינים": { name: "Philippines", code: "PH" },
  "הפיליפינים": { name: "Philippines", code: "PH" },
  "לאוס": { name: "Laos", code: "LA" },
  "קמבודיה": { name: "Cambodia", code: "KH" },
  "מלזיה": { name: "Malaysia", code: "MY" },
  "סינגפור": { name: "Singapore", code: "SG" },
  "אינדונזיה": { name: "Indonesia", code: "ID" },
  "באלי": { name: "Indonesia", code: "ID" },
  "טייוואן": { name: "Taiwan", code: "TW" },
  "דרום קוריאה": { name: "South Korea", code: "KR" },
  "ישראל": { name: "Israel", code: "IL" },
};

function countryFor(label: string | null): { name: string | null; code: string | null } {
  const key = (label ?? "").trim();
  if (key === "") return { name: null, code: null };
  const hit = COUNTRY[key];
  return hit ? { name: hit.name, code: hit.code } : { name: key, code: null };
}

/** Query variants for one row, best first. The second drops the country, which
 *  is what rescues a row filed under the wrong one. */
function queriesFor(row: Row, countryName: string | null): string[] {
  const join = (parts: (string | null)[]) =>
    parts
      .map((p) => p?.trim())
      .filter((p): p is string => !!p)
      .join(", ");

  const withCountry = join([row.title, row.area, countryName]);
  const withoutCountry = join([row.title, row.area]);

  const out = [withCountry];
  if (withoutCountry !== "" && withoutCountry !== withCountry) out.push(withoutCountry);
  return out.filter((q) => q !== "");
}

/** Non-OK Google `status` values worth shouting about, as opposed to a plain
 *  miss. These are configuration faults — the key is restricted to browser
 *  referrers, or the API is not enabled on the project — and they previously
 *  read as "place not found" in the logs, which sent debugging the wrong way. */
const GOOGLE_FAULTS = new Set([
  "REQUEST_DENIED",
  "OVER_QUERY_LIMIT",
  "INVALID_REQUEST",
  "UNKNOWN_ERROR",
]);

type GoogleOutcome = { hit: Hit | null; fault: string | null };

async function googleJson(url: string): Promise<{ data: any; fault: string | null }> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { data: null, fault: `http_${res.status}` };
    const data = await res.json();
    const status = data?.status;
    if (typeof status === "string" && GOOGLE_FAULTS.has(status)) {
      // error_message carries the actionable half ("API keys with referer
      // restrictions cannot be used with this API").
      return { data: null, fault: `${status}: ${data?.error_message ?? ""}`.trim() };
    }
    return { data, fault: null };
  } catch (e) {
    return { data: null, fault: `fetch_failed: ${(e as Error).message}` };
  }
}

/** Places Text Search: resolves business names, which is what most of this
 *  bank is. Region-biased by the row's country when we know its ISO code. */
async function placesText(
  query: string,
  key: string,
  regionCode: string | null
): Promise<GoogleOutcome> {
  const url =
    `https://maps.googleapis.com/maps/api/place/textsearch/json` +
    `?query=${encodeURIComponent(query)}&key=${key}` +
    (regionCode ? `&region=${encodeURIComponent(regionCode.toLowerCase())}` : "");
  const { data, fault } = await googleJson(url);
  if (fault) return { hit: null, fault };
  const r = data?.results?.[0];
  const loc = r?.geometry?.location;
  if (typeof loc?.lat !== "number" || typeof loc?.lng !== "number") {
    return { hit: null, fault: null };
  }
  return {
    hit: {
      lat: loc.lat,
      lng: loc.lng,
      placeId: r?.place_id ?? null,
      label: r?.formatted_address ?? r?.name ?? null,
      provider: "places",
    },
    fault: null,
  };
}

/** Geocoding: addresses and administrative places — provinces, parks, communes
 *  — which Text Search is weaker at. */
async function geocodeGoogle(
  query: string,
  key: string,
  regionCode: string | null
): Promise<GoogleOutcome> {
  const url =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?address=${encodeURIComponent(query)}&key=${key}` +
    (regionCode ? `&region=${encodeURIComponent(regionCode.toLowerCase())}` : "");
  const { data, fault } = await googleJson(url);
  if (fault) return { hit: null, fault };
  const r = data?.results?.[0];
  const loc = r?.geometry?.location;
  if (typeof loc?.lat !== "number" || typeof loc?.lng !== "number") {
    return { hit: null, fault: null };
  }
  return {
    hit: {
      lat: loc.lat,
      lng: loc.lng,
      placeId: r?.place_id ?? null,
      label: r?.formatted_address ?? null,
      provider: "geocode",
    },
    fault: null,
  };
}

async function geocodeNominatim(
  query: string,
  countryCode: string | null
): Promise<Hit | null> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/search?format=json&limit=1` +
      `&q=${encodeURIComponent(query)}` +
      (countryCode ? `&countrycodes=${encodeURIComponent(countryCode.toLowerCase())}` : "");
    const res = await fetch(url, {
      headers: { "User-Agent": "OurTrip/1.0 (family trip planner)" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const hit = data?.[0];
    const lat = Number(hit?.lat);
    const lng = Number(hit?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      lat,
      lng,
      placeId: null,
      label: hit?.display_name ?? null,
      provider: "nominatim",
    };
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

  let body: { trip_id?: string; retry_failed?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad request" }, 400);
  }
  const tripId = (body.trip_id ?? "").trim();
  if (tripId === "") return json({ ok: false, error: "trip required" }, 400);

  // "Try the stubborn ones again": clears the attempt counter so rows that hit
  // the cap re-enter the queue. Used after the provider chain changes, or when
  // the owner has fixed a country or area by hand.
  if (body.retry_failed === true) {
    const { error: resetError } = await caller
      .from("place_options")
      .update({ geocode_attempts: 0 })
      .eq("trip_id", tripId)
      .is("lat", null)
      .gt("geocode_attempts", 0);
    if (resetError) {
      console.error("geocode-places: reset failed:", resetError.message);
      return json({ ok: false, error: "read_failed" }, 502);
    }
  }

  // RLS scopes this to the caller's own trip regardless of what id is passed.
  // Ordering by attempts then created_at makes the paging deterministic: the
  // least-tried rows come first, so one bad row can't hold up the queue.
  const { data: rows, error: readError } = await caller
    .from("place_options")
    .select("id, title, area, country, country_code, geocode_attempts")
    .eq("trip_id", tripId)
    .is("lat", null)
    .lt("geocode_attempts", MAX_ATTEMPTS)
    .order("geocode_attempts", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (readError) {
    console.error("geocode-places: read failed:", readError.message);
    return json({ ok: false, error: "read_failed" }, 502);
  }

  const pending = (rows ?? []) as Row[];
  const googleKey = Deno.env.get("GOOGLE_MAPS_API_KEY");

  if (pending.length === 0) {
    // Nothing left to try. Distinguish "all located" from "the rest gave up",
    // so the UI can offer a retry instead of implying success.
    const { count: exhausted } = await caller
      .from("place_options")
      .select("id", { count: "exact", head: true })
      .eq("trip_id", tripId)
      .is("lat", null);
    return json({
      ok: true,
      located: 0,
      failed: 0,
      remaining: 0,
      exhausted: exhausted ?? 0,
      provider: googleKey ? "google" : "nominatim",
      fault: null,
    });
  }

  let located = 0;
  let failed = 0;
  // First configuration fault seen this run (a restricted key, a disabled API).
  // Surfaced to the client, because it is the difference between "these places
  // are obscure" and "Google is refusing every call".
  let fault: string | null = null;
  let nominatimUsed = false;

  for (let i = 0; i < pending.length; i++) {
    const row = pending[i];
    const { name: countryName, code: countryCode } = countryFor(row.country);
    const regionCode = row.country_code || countryCode;
    const queries = queriesFor(row, countryName);

    let hit: Hit | null = null;

    for (const query of queries) {
      if (googleKey) {
        const text = await placesText(query, googleKey, regionCode);
        if (text.fault && !fault) fault = text.fault;
        hit = text.hit;

        if (!hit) {
          const geo = await geocodeGoogle(query, googleKey, regionCode);
          if (geo.fault && !fault) fault = geo.fault;
          hit = geo.hit;
        }
      }

      // Last resort, and the whole path when no key is configured. Throttled
      // per Nominatim's usage policy.
      if (!hit) {
        if (nominatimUsed) await sleep(NOMINATIM_DELAY_MS);
        hit = await geocodeNominatim(query, regionCode);
        nominatimUsed = true;
      }

      if (hit) break;
    }

    if (!hit) {
      // Count the miss so the next batch moves past this row. A write failure
      // here would re-queue the row forever, so it is logged, not swallowed.
      const { error: bumpError } = await caller
        .from("place_options")
        .update({ geocode_attempts: row.geocode_attempts + 1 })
        .eq("id", row.id);
      if (bumpError) {
        console.error(
          `geocode-places: attempt bump failed for ${row.id}:`,
          bumpError.message
        );
      }
      failed++;
      continue;
    }

    const patch: Record<string, unknown> = { lat: hit.lat, lng: hit.lng };
    // Only fill fields the row hasn't got: an owner-picked place_id or a
    // hand-typed location_name outranks anything guessed from a name.
    if (hit.placeId) patch.place_id = hit.placeId;
    if (hit.label) patch.location_name = hit.label;
    if (!row.country_code && countryCode) patch.country_code = countryCode;

    const { error: writeError } = await caller
      .from("place_options")
      .update(patch)
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

  // Rows still worth another call, so the client knows whether to loop, and
  // rows that have used up their attempts, so it can say so plainly.
  const [{ count: remaining }, { count: unresolved }] = await Promise.all([
    caller
      .from("place_options")
      .select("id", { count: "exact", head: true })
      .eq("trip_id", tripId)
      .is("lat", null)
      .lt("geocode_attempts", MAX_ATTEMPTS),
    caller
      .from("place_options")
      .select("id", { count: "exact", head: true })
      .eq("trip_id", tripId)
      .is("lat", null),
  ]);

  const exhausted = (unresolved ?? 0) - (remaining ?? 0);

  console.log(
    `geocode-places: ${located} located, ${failed} failed, ${remaining ?? 0} remaining, ` +
      `${exhausted} gave up (provider: ${googleKey ? "google" : "nominatim"}` +
      `${fault ? `, fault: ${fault}` : ""})`
  );

  return json({
    ok: true,
    located,
    failed,
    remaining: remaining ?? 0,
    exhausted,
    provider: googleKey ? "google" : "nominatim",
    fault,
  });
});
