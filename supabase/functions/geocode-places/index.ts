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
// RESULT QUALITY (2026-09-04). Google's Geocoding API never says "no". Asked
// for "Aroma Indian Restaurant, Tam Coc, ויטנאם" it answered with the CENTRE OF
// VIETNAM, and because the old code took results[0].geometry.location without
// looking at what had come back, 83 of 343 options ended up stacked on 8
// country and city centroids — a map that looked populated and was wrong.
// Two changes stop that: named places are looked up through Places Text Search
// (which is built for business names and returns a real place_id), and every
// answer, from either API, must pass `isPreciseEnough` before it is written.
// A rejected answer leaves the row unlocated, which is honest.
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

// With the precision guard below, a name Google genuinely cannot resolve now
// FAILS instead of quietly landing on a country centroid. Without a cap those
// rows would be re-attempted on every run for the rest of the trip, crowding
// out rows that could still succeed. Reset geocode_attempts to 0 to try again.
const GEOCODE_MAX_ATTEMPTS = 3;
const NOMINATIM_DELAY_MS = 1100;

type Row = {
  id: string;
  title: string;
  area: string | null;
  country: string | null;
  country_code: string | null;
  category: string | null;
  geocode_attempts: number;
};

type Coords = { lat: number; lng: number; placeId?: string };

// An option whose category IS a place-on-the-map: a town, a province, a region.
// For these an administrative or locality answer is not the geocoder giving up,
// it is the right answer.
const PLACE_LIKE = new Set(["city"]);

// Categories that sit somewhere real but may only be known at town granularity:
// a national park, a bus route. They must not resolve to a whole province, but
// a locality-level answer is acceptable.
const WIDE_OK = new Set(["nature", "transport"]);

// Nothing is ever pinned on a whole country.
const NEVER = new Set(["country", "continent", "political"]);

// Province / state / district. Too coarse for a restaurant; exactly right for
// an option that names a province.
const ADMIN = new Set([
  "administrative_area_level_1",
  "administrative_area_level_2",
  "administrative_area_level_3",
]);

/** Is this answer specific enough to pin, GIVEN what the option claims to be?
 *
 *  The first version of this guard judged every row by the same yardstick and
 *  refused anything administrative, which silently dropped Da Nang, Sapa, Hà
 *  Giang and Bohol — the towns the trip actually visits. Vietnam files Da Nang
 *  as a municipality and Sapa as a province, so an administrative answer there
 *  is not the geocoder failing, it is the correct one. A restaurant answered
 *  with a province still is a failure. Hence: the bar depends on the row. */
function isPreciseEnough(types: unknown, row: Row): boolean {
  if (!Array.isArray(types) || types.length === 0) return false;
  const t = types as string[];
  const category = row.category ?? "";

  // "political" alone means a boundary with no other classification; paired
  // with locality or an admin level it is just noise, so it only disqualifies
  // an answer that offers nothing else.
  if (t.every((x) => NEVER.has(x))) return false;
  if (t.includes("country") || t.includes("continent")) return false;

  if (PLACE_LIKE.has(category)) return true; // a town or region: admin is right
  if (t.some((x) => ADMIN.has(x))) return false; // everything else: too coarse
  if (WIDE_OK.has(category)) return true; // a park or a route: a town is fine
  return !t.some((x) => x === "locality" || x === "postal_code");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Name plus the area that disambiguates it. The COUNTRY is deliberately not
 *  in the string any more: it was carried in Hebrew ("ויטנאם"), which adds a
 *  second script to the query for no benefit, and it is expressed far better
 *  as a `components=country:VN` constraint that narrows the search instead of
 *  competing with it. */
function queryFor(row: Row): string {
  return [row.title, row.area]
    .map((p) => p?.trim())
    .filter((p): p is string => !!p)
    .join(", ");
}

/** Places Text Search. Built for "Roving chill house Hội An" in a way the
 *  Geocoding API is not, and it hands back the place's own place_id, which the
 *  map and the day picker both want. */
async function placesTextSearch(
  query: string,
  row: Row,
  key: string
): Promise<Coords | null> {
  try {
    const region = row.country_code ? `&region=${row.country_code.toLowerCase()}` : "";
    const url =
      `https://maps.googleapis.com/maps/api/place/textsearch/json` +
      `?query=${encodeURIComponent(query)}${region}&key=${key}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const hit = data?.results?.[0];
    const loc = hit?.geometry?.location;
    if (typeof loc?.lat !== "number" || typeof loc?.lng !== "number") return null;
    if (!isPreciseEnough(hit?.types, row)) return null;
    return {
      lat: loc.lat,
      lng: loc.lng,
      placeId: typeof hit?.place_id === "string" ? hit.place_id : undefined,
    };
  } catch {
    return null;
  }
}

async function geocodeGoogle(
  query: string,
  row: Row,
  key: string
): Promise<Coords | null> {
  try {
    // components=country narrows the search rather than adding a term that can
    // itself be matched — which is how a restaurant became a whole country.
    const components = row.country_code
      ? `&components=country:${encodeURIComponent(row.country_code)}`
      : "";
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json` +
      `?address=${encodeURIComponent(query)}${components}&key=${key}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const hit = data?.results?.[0];
    const loc = hit?.geometry?.location;
    if (typeof loc?.lat !== "number" || typeof loc?.lng !== "number") return null;
    if (!isPreciseEnough(hit?.types, row)) return null;
    return {
      lat: loc.lat,
      lng: loc.lng,
      placeId: typeof hit?.place_id === "string" ? hit.place_id : undefined,
    };
  } catch {
    return null;
  }
}

async function geocodeNominatim(query: string, row: Row): Promise<Coords | null> {
  try {
    const cc = row.country_code
      ? `&countrycodes=${encodeURIComponent(row.country_code.toLowerCase())}`
      : "";
    const url =
      `https://nominatim.openstreetmap.org/search?format=json&limit=1` +
      `&q=${encodeURIComponent(query)}${cc}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "OurTrip/1.0 (family trip planner)" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const hit = data?.[0];
    const lat = Number(hit?.lat);
    const lng = Number(hit?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    // Same guard as the Google path, in Nominatim's vocabulary: without it the
    // keyless path would happily pin a cafe to a country outline.
    const kind = String(hit?.addresstype ?? hit?.type ?? "");
    const category = row.category ?? "";
    if (kind === "country") return null;
    if (!PLACE_LIKE.has(category)) {
      if (["state", "region", "province"].includes(kind)) return null;
      if (!WIDE_OK.has(category) && ["city", "town", "municipality"].includes(kind)) {
        return null;
      }
    }
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
    .select("id, title, area, country, country_code, category, geocode_attempts")
    .eq("trip_id", tripId)
    .is("lat", null)
    .lt("geocode_attempts", GEOCODE_MAX_ATTEMPTS)
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

    // Places Text Search understands business names; geocoding is the
    // fallback for the ones it does not know. Both must clear isPreciseEnough.
    const coords = googleKey
      ? ((await placesTextSearch(query, row, googleKey)) ??
         (await geocodeGoogle(query, row, googleKey)))
      : await geocodeNominatim(query, row);

    if (!coords) {
      failed++;
      // Count the attempt, so a name nothing can resolve eventually stops
      // being retried. A successful row never gets here, so the counter only
      // ever tracks failures.
      await caller
        .from("place_options")
        .update({ geocode_attempts: row.geocode_attempts + 1 })
        .eq("id", row.id);
    } else {
      const { error: writeError } = await caller
        .from("place_options")
        .update({
          lat: coords.lat,
          lng: coords.lng,
          ...(coords.placeId ? { place_id: coords.placeId } : {}),
        })
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

  // How many still have no coordinates AND are still worth trying, so the
  // client knows whether to call again. A row that has used up its attempts is
  // excluded on purpose: counting it would leave the progress indicator
  // counting down toward a number it can never reach.
  const { count } = await caller
    .from("place_options")
    .select("id", { count: "exact", head: true })
    .eq("trip_id", tripId)
    .is("lat", null)
    .lt("geocode_attempts", GEOCODE_MAX_ATTEMPTS);

  console.log(
    `geocode-places: ${located} located, ${failed} failed, ${count ?? 0} remaining ` +
      `(provider: ${googleKey ? "google" : "nominatim"})`
  );

  return json({ ok: true, located, failed, remaining: count ?? 0 });
});
