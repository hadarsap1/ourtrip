// Flight & hotel search (SPEC addition — "search best flights and hotels").
// Owner-gated (deployed verify_jwt=true; additionally re-checks role='owner'
// in-function, same pattern as recommend / phrasebook-generate).
//
// Proxies two RapidAPI services so the family can compare live fares/prices
// from inside the trip planner and park a result straight into the bookings
// list:
//   - Google Flights Live API  (google-flights-live-api.p.rapidapi.com)
//   - Booking Live API         (booking-live-api.p.rapidapi.com)
//
// The single RapidAPI key lives ONLY as a function secret (RAPIDAPI_KEY),
// never in client code (CLAUDE.md hard rule #8). The browser calls this
// function; the function calls RapidAPI.
//
// Multi-country aware (CLAUDE.md hard rule #9): nothing is hardcoded to a
// destination country or currency — origin/destination and currency come from
// the request.
//
// Response field mapping is intentionally DEFENSIVE. These community RapidAPI
// wrappers occasionally rename/rearrange fields, so every extractor tries a
// few plausible shapes and degrades to null rather than throwing. Results are
// ephemeral; the client saves what it wants as a booking.

import { createClient } from "npm:@supabase/supabase-js@2";

const FLIGHTS_HOST = "google-flights-live-api.p.rapidapi.com";
const HOTELS_HOST = "booking-live-api.p.rapidapi.com";

// Browser calls this cross-origin (Vercel → *.supabase.co), so every response
// — including the CORS preflight — must carry these headers.
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

// A single normalized result. Shared shape for flights and hotels so the client
// renders one card and maps cleanly onto a booking row (title/cost/currency/
// dates/link/details → bookings table).
type Result = {
  id: string;
  kind: "flight" | "hotel";
  title: string;
  subtitle: string | null;
  price: number | null;
  currency: string | null;
  link_url: string | null;
  image_url: string | null;
  start_date: string | null;
  end_date: string | null;
  details: Record<string, string>;
};

// ---------- small helpers ----------

function isIata(s: string): boolean {
  return /^[A-Za-z]{3}$/.test(s.trim());
}

/** Pull the first number out of a value that may be a number, a numeric string,
 *  or a formatted price string like "$1,240" / "1.240,50 €". Best-effort. */
function toNumber(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const m = v.replace(/[^\d.,]/g, "");
    if (!m) return null;
    // strip thousands separators, keep the last separator as decimal
    const cleaned = m.replace(/[.,](?=\d{3}\b)/g, "").replace(",", ".");
    const n = Number(cleaned);
    return isFinite(n) ? n : null;
  }
  return null;
}

function firstString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

function pick<T = unknown>(obj: unknown, ...paths: string[]): T | undefined {
  for (const path of paths) {
    let cur: unknown = obj;
    let ok = true;
    for (const key of path.split(".")) {
      if (cur && typeof cur === "object" && key in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[key];
      } else {
        ok = false;
        break;
      }
    }
    if (ok && cur !== undefined && cur !== null) return cur as T;
  }
  return undefined;
}

async function rapidGet(
  host: string,
  path: string,
  params: Record<string, string | number | undefined>,
  key: string
): Promise<unknown> {
  const url = new URL(`https://${host}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    headers: { "x-rapidapi-key": key, "x-rapidapi-host": host },
  });
  if (!res.ok) {
    throw new Error(`upstream ${res.status}`);
  }
  return res.json();
}

/** Returns the first array found among several candidate paths in a response. */
function findArray(data: unknown, ...paths: string[]): unknown[] {
  for (const p of paths) {
    const v = pick(data, p);
    if (Array.isArray(v)) return v;
  }
  // last resort: a top-level array
  if (Array.isArray(data)) return data;
  return [];
}

// ---------- flights ----------

/** Resolve a free-text place (or a raw IATA code) to a departure/arrival id
 *  the flight search accepts. IATA codes are passed through directly; anything
 *  else is looked up via searchAirport. */
async function resolveAirport(text: string, key: string): Promise<string | null> {
  const t = text.trim();
  if (!t) return null;
  if (isIata(t)) return t.toUpperCase();
  try {
    const data = await rapidGet(FLIGHTS_HOST, "/api/v1/searchAirport", { query: t }, key);
    const list = findArray(data, "data", "data.airports", "airports", "results");
    const first = list[0] as Record<string, unknown> | undefined;
    if (!first) return null;
    return (
      firstString(
        pick(first, "id", "skyId", "entityId", "iata", "code", "presentation.id")
      ) ?? null
    );
  } catch {
    return null;
  }
}

function normalizeFlight(raw: unknown, currency: string): Result | null {
  const r = raw as Record<string, unknown>;
  const legs = (pick<unknown[]>(r, "flights", "legs", "segments") ?? []) as Record<
    string,
    unknown
  >[];
  const first = legs[0] ?? {};
  const last = legs[legs.length - 1] ?? first;

  const airline =
    firstString(
      pick(r, "airline", "airlines.0.name"),
      pick(first, "airline.name", "airline", "carrier", "airline_name")
    ) ?? "";
  const dep = firstString(
    pick(first, "departure_airport.id", "departure_airport.airport", "departureAirport", "origin"),
    pick(r, "departure", "origin")
  );
  const arr = firstString(
    pick(last, "arrival_airport.id", "arrival_airport.airport", "arrivalAirport", "destination"),
    pick(r, "arrival", "destination")
  );
  const depTime = firstString(
    pick(first, "departure_airport.time", "departure_time", "departureTime")
  );
  const arrTime = firstString(
    pick(last, "arrival_airport.time", "arrival_time", "arrivalTime")
  );
  const durationTxt = firstString(pick(r, "duration.text", "duration", "total_duration"));
  const stops = pick<number>(r, "stops");
  const price = toNumber(pick(r, "price", "price.raw", "totalPrice", "fare"));
  const cur = firstString(pick(r, "currency", "price.currency")) ?? currency;

  const routeTitle = dep && arr ? `${dep} → ${arr}` : dep || arr || "טיסה";
  const title = airline ? `${routeTitle} · ${airline}` : routeTitle;

  const subParts: string[] = [];
  if (depTime || arrTime) subParts.push(`${depTime ?? ""}${arrTime ? " → " + arrTime : ""}`.trim());
  if (durationTxt) subParts.push(durationTxt);
  if (typeof stops === "number") subParts.push(stops === 0 ? "ישיר" : `${stops} עצירות`);

  const details: Record<string, string> = {};
  const flightNo = firstString(pick(first, "flight_number", "flightNumber"));
  if (flightNo) details.flight_number = flightNo;
  if (airline) details.airline = airline;
  if (dep) details.from = dep;
  if (arr) details.to = arr;

  const link = firstString(pick(r, "booking_url", "link", "url", "bookingToken"));

  return {
    id: crypto.randomUUID(),
    kind: "flight",
    title,
    subtitle: subParts.join(" · ") || null,
    price,
    currency: price != null ? cur : null,
    link_url: link,
    image_url: null,
    start_date: null,
    end_date: null,
    details,
  };
}

async function searchFlights(
  body: Record<string, unknown>,
  key: string
): Promise<Result[]> {
  const origin = String(body.origin ?? "").trim();
  const destination = String(body.destination ?? "").trim();
  const departureDate = String(body.departure_date ?? "").trim();
  if (!origin || !destination || !departureDate) return [];

  const [depId, arrId] = await Promise.all([
    resolveAirport(origin, key),
    resolveAirport(destination, key),
  ]);
  if (!depId || !arrId) return [];

  const currency = String(body.currency ?? "USD").trim() || "USD";
  const returnDate = String(body.return_date ?? "").trim();
  const data = await rapidGet(
    FLIGHTS_HOST,
    "/api/v1/searchFlights",
    {
      departureId: depId,
      arrivalId: arrId,
      departureDate,
      arrivalDate: returnDate || undefined,
      travelClass: String(body.cabin ?? "ECONOMY") || "ECONOMY",
      adults: Number(body.adults) > 0 ? Number(body.adults) : 1,
      currency,
    },
    key
  );

  const list = findArray(
    data,
    "data.topFlights",
    "data.otherFlights",
    "data.itineraries",
    "topFlights",
    "itineraries",
    "data.flights",
    "data"
  );
  const results = list
    .map((f) => normalizeFlight(f, currency))
    .filter((r): r is Result => r !== null && (r.title !== "טיסה" || r.price != null));

  // include start/end so the client can prefill booking dates
  for (const r of results) {
    r.start_date = departureDate;
    r.end_date = returnDate || null;
  }
  return results.slice(0, 20);
}

// ---------- hotels ----------

async function resolveDestination(
  text: string,
  key: string
): Promise<{ destId: string; searchType: string } | null> {
  const t = text.trim();
  if (!t) return null;
  try {
    const data = await rapidGet(
      HOTELS_HOST,
      "/api/v1/hotels/searchDestination",
      { query: t },
      key
    );
    const list = findArray(data, "data", "data.destinations", "results");
    const first = list[0] as Record<string, unknown> | undefined;
    if (!first) return null;
    const destId = firstString(pick(first, "dest_id", "destId", "id"));
    if (!destId) return null;
    const searchType =
      firstString(pick(first, "search_type", "searchType", "dest_type", "type")) ??
      "CITY";
    return { destId, searchType };
  } catch {
    return null;
  }
}

function normalizeHotel(raw: unknown, currency: string): Result | null {
  const r = raw as Record<string, unknown>;
  const prop = (pick<Record<string, unknown>>(r, "property") ?? r) as Record<
    string,
    unknown
  >;

  const name = firstString(pick(prop, "name"), pick(r, "hotel_name", "name"));
  if (!name) return null;

  const price = toNumber(
    pick(
      prop,
      "priceBreakdown.grossPrice.value",
      "priceBreakdown.grossPrice.amount",
      "price"
    ) ?? pick(r, "price", "min_total_price", "composite_price_breakdown.gross_amount.value")
  );
  const cur =
    firstString(
      pick(prop, "priceBreakdown.grossPrice.currency", "currency"),
      pick(r, "currency", "currencycode")
    ) ?? currency;

  const score = toNumber(pick(prop, "reviewScore", "review_score") ?? pick(r, "review_score"));
  const reviewWord = firstString(
    pick(prop, "reviewScoreWord", "review_score_word"),
    pick(r, "review_score_word")
  );
  const photo = firstString(
    pick(prop, "photoUrls.0", "main_photo_url"),
    pick(r, "main_photo_url", "max_photo_url")
  );
  const address = firstString(pick(r, "address", "wishlistName"), pick(prop, "wishlistName"));

  const checkin = firstString(pick(prop, "checkinDate", "checkin_date"), pick(r, "checkin"));
  const checkout = firstString(
    pick(prop, "checkoutDate", "checkout_date"),
    pick(r, "checkout")
  );

  const subParts: string[] = [];
  if (score != null) subParts.push(`★ ${score}${reviewWord ? " " + reviewWord : ""}`);
  if (address) subParts.push(address);

  const details: Record<string, string> = {};
  if (address) details.address = address;
  if (score != null) details.review_score = String(score);

  const hotelId = firstString(pick(prop, "id", "hotel_id"), pick(r, "hotel_id"));
  const link = firstString(pick(r, "url", "link"), pick(prop, "url"));

  return {
    id: hotelId ?? crypto.randomUUID(),
    kind: "hotel",
    title: name,
    subtitle: subParts.join(" · ") || null,
    price,
    currency: price != null ? cur : null,
    link_url: link,
    image_url: photo,
    start_date: checkin,
    end_date: checkout,
    details,
  };
}

async function searchHotels(
  body: Record<string, unknown>,
  key: string
): Promise<Result[]> {
  const destination = String(body.destination ?? "").trim();
  const checkIn = String(body.check_in ?? "").trim();
  const checkOut = String(body.check_out ?? "").trim();
  if (!destination || !checkIn || !checkOut) return [];

  const dest = await resolveDestination(destination, key);
  if (!dest) return [];

  const currency = String(body.currency ?? "USD").trim() || "USD";
  const data = await rapidGet(
    HOTELS_HOST,
    "/api/v1/hotels/searchHotels",
    {
      dest_id: dest.destId,
      search_type: dest.searchType,
      arrival_date: checkIn,
      departure_date: checkOut,
      adults: Number(body.adults) > 0 ? Number(body.adults) : 2,
      room_qty: Number(body.rooms) > 0 ? Number(body.rooms) : 1,
      currency_code: currency,
    },
    key
  );

  const list = findArray(
    data,
    "data.hotels",
    "data.result",
    "hotels",
    "result",
    "data"
  );
  const results = list
    .map((h) => normalizeHotel(h, currency))
    .filter((r): r is Result => r !== null);

  for (const r of results) {
    if (!r.start_date) r.start_date = checkIn;
    if (!r.end_date) r.end_date = checkOut;
  }
  return results.slice(0, 20);
}

// ---------- entrypoint ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad request" }, 400);
  }

  const mode = body.mode === "hotels" ? "hotels" : body.mode === "flights" ? "flights" : null;
  if (!mode) return json({ ok: false, error: "mode required" }, 400);

  // owner gate (caller's own JWT + RLS helper), identical to recommend
  const caller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
  );
  const { data: role } = await caller.rpc("current_member_role");
  if (role !== "owner") return json({ ok: false, error: "forbidden" }, 403);

  const key = Deno.env.get("RAPIDAPI_KEY");
  if (!key) return json({ ok: false, error: "not_configured" }, 503);

  try {
    const results =
      mode === "flights"
        ? await searchFlights(body, key)
        : await searchHotels(body, key);
    return json({ ok: true, mode, results });
  } catch (err) {
    console.error(`travel-search (${mode}) failed:`, (err as Error).message);
    return json({ ok: false, error: "search_failed" }, 502);
  }
});
