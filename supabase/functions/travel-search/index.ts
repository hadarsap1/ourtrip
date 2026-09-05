// Flight & hotel search (SPEC addition - "search best flights and hotels").
// Owner-gated (deployed verify_jwt=true; additionally re-checks role='owner'
// in-function, same pattern as recommend / phrasebook-generate).
//
// Proxies two RapidAPI services (both by mtnrabi), field names confirmed
// against live responses:
//   - Google Flights Live API (google-flights-live-api.p.rapidapi.com)
//       POST /api/google_flights/oneway/v1     {from_airport,to_airport,departure_date}
//       POST /api/google_flights/roundtrip/v1  {…,return_date}
//     → array of trip summaries: total_price_as_number, total_price ("$984"),
//       total_duration_seconds, total_stops, from_airport ("Tel Aviv (TLV)"),
//       to_airport, buy_link. (This API does not take passenger counts.)
//   - Booking Live API (booking-live-api.p.rapidapi.com)
//       POST /search  {destination,checkin_date,checkout_date,adults,children,currency}
//     → array of properties: name, price, price_string ("₪2774"), review_score,
//       review_count, image_url, room_type, location, link.
//
// The single RapidAPI key lives ONLY as a function secret (RAPIDAPI_KEY),
// never in client code (CLAUDE.md hard rule #8). The browser calls this
// function; the function calls RapidAPI.
//
// Multi-country aware (CLAUDE.md hard rule #9): origin/destination and currency
// come from the request; nothing is hardcoded to a country or currency. Results
// are ephemeral; the client saves what it wants as a booking.

import { createClient } from "npm:@supabase/supabase-js@2";

const FLIGHTS_HOST = "google-flights-live-api.p.rapidapi.com";
const HOTELS_HOST = "booking-live-api.p.rapidapi.com";

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

// ---------- helpers ----------

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const m = v.replace(/[^\d.,]/g, "");
    if (!m) return null;
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

/** Detect a currency code from a formatted price string's symbol. */
function currencyFrom(priceStr: string | null, fallback: string): string {
  if (priceStr) {
    if (priceStr.includes("₪")) return "ILS";
    if (priceStr.includes("€")) return "EUR";
    if (priceStr.includes("£")) return "GBP";
    if (priceStr.includes("¥")) return "JPY";
    if (priceStr.includes("$")) return "USD";
  }
  return fallback;
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

function findArray(data: unknown, ...paths: string[]): unknown[] {
  for (const p of paths) {
    const v = pick(data, p);
    if (Array.isArray(v)) return v;
  }
  if (Array.isArray(data)) return data;
  return [];
}

async function postJson(
  host: string,
  path: string,
  body: Record<string, unknown>,
  key: string
): Promise<{ status: number; data: unknown | null }> {
  const res = await fetch(`https://${host}${path}`, {
    method: "POST",
    headers: {
      "x-rapidapi-key": key,
      "x-rapidapi-host": host,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { status: res.status, data: null };
  return { status: res.status, data: await res.json().catch(() => null) };
}

/** Tries candidate endpoints in order; returns the first successful response. */
async function tryPost(
  host: string,
  candidates: { path: string; body: Record<string, unknown> }[],
  key: string
): Promise<unknown | null> {
  for (const c of candidates) {
    const { status, data } = await postJson(host, c.path, c.body, key);
    if (status >= 200 && status < 300 && data != null) return data;
  }
  return null;
}

// ---------- flights ----------

function normalizeFlight(
  raw: unknown,
  origin: string,
  destination: string,
  fallbackCurrency: string
): Result | null {
  const r = raw as Record<string, unknown>;

  const from = firstString(pick(r, "from_airport", "origin")) ?? origin;
  const to = firstString(pick(r, "to_airport", "destination")) ?? destination;

  const priceStr = firstString(pick(r, "total_price", "price_string", "price"));
  const price = toNumber(
    pick(r, "total_price_as_number", "price_as_number", "price", "fare")
  );
  const cur = currencyFrom(priceStr, firstString(pick(r, "currency")) ?? fallbackCurrency);

  const durSec = pick<number>(r, "total_duration_seconds", "duration_seconds");
  const durMin = typeof durSec === "number" ? Math.round(durSec / 60) : null;
  const durationTxt =
    typeof durMin === "number"
      ? `${Math.floor(durMin / 60)}ש׳ ${durMin % 60}ד׳`
      : firstString(pick(r, "duration"));

  const stops = pick<number>(r, "total_stops", "stops", "number_of_stops");
  const airline =
    (firstString(pick(r, "airline", "airline_name", "airlines")) ?? "").split("|")[0].trim();
  const depTime = firstString(pick(r, "departure_description", "departure_time"));
  const arrTime = firstString(pick(r, "arrival_description", "arrival_time"));

  const title = airline ? `${from} → ${to} · ${airline}` : `${from} → ${to}`;

  const subParts: string[] = [];
  if (depTime || arrTime) subParts.push(`${depTime ?? ""}${arrTime ? " → " + arrTime : ""}`.trim());
  if (durationTxt) subParts.push(durationTxt);
  if (typeof stops === "number") subParts.push(stops === 0 ? "ישיר" : `${stops} עצירות`);

  const details: Record<string, string> = { from, to };
  if (airline) details.airline = airline;

  const gfLink = `https://www.google.com/travel/flights?q=${encodeURIComponent(
    `flights from ${origin} to ${destination}`
  )}`;
  const link = firstString(pick(r, "buy_link", "booking_url", "link", "url")) ?? gfLink;

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
  const origin = String(body.origin ?? "").trim().toUpperCase();
  const destination = String(body.destination ?? "").trim().toUpperCase();
  const departureDate = String(body.departure_date ?? "").trim();
  if (!origin || !destination || !departureDate) return [];

  const currency = String(body.currency ?? "USD").trim() || "USD";
  const returnDate = String(body.return_date ?? "").trim();

  const oneway = { from_airport: origin, to_airport: destination, departure_date: departureDate };
  const round = { ...oneway, return_date: returnDate };
  const candidates = returnDate
    ? [
        { path: "/api/google_flights/roundtrip/v1", body: round },
        { path: "/api/google-flights/roundtrip/v1", body: round },
        { path: "/api/google_flights/oneway/v1", body: oneway },
      ]
    : [
        { path: "/api/google_flights/oneway/v1", body: oneway },
        { path: "/api/google-flights/oneway/v1", body: oneway },
      ];

  const data = await tryPost(FLIGHTS_HOST, candidates, key);
  if (!data) return [];

  const list = findArray(data, "data", "flights", "results", "itineraries");
  const results = list
    .map((f) => normalizeFlight(f, origin, destination, currency))
    .filter((r): r is Result => r !== null);
  for (const r of results) {
    r.start_date = departureDate;
    r.end_date = returnDate || null;
  }
  results.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  return results.slice(0, 20);
}

// ---------- hotels ----------

function normalizeHotel(raw: unknown, fallbackCurrency: string): Result | null {
  const r = raw as Record<string, unknown>;
  const name = firstString(pick(r, "name", "hotel_name", "title", "property.name"));
  if (!name) return null;

  const priceStr = firstString(pick(r, "price_string"));
  const price = toNumber(
    pick(r, "price", "price_per_night", "gross_price", "total_price", "min_total_price")
  );
  const cur = currencyFrom(
    priceStr,
    firstString(pick(r, "currency", "currency_code", "currencycode")) ?? fallbackCurrency
  );
  const score = toNumber(pick(r, "review_score", "rating", "score", "reviewScore"));
  const reviewCount = pick<number>(r, "review_count");
  const roomType = firstString(pick(r, "room_type"));
  const photo = firstString(
    pick(r, "image_url", "main_photo_url", "photo", "image", "thumbnail", "photoUrls.0")
  );
  const address = firstString(pick(r, "location", "address", "city"));

  const subParts: string[] = [];
  if (score != null) subParts.push(`★ ${score}${reviewCount ? ` (${reviewCount})` : ""}`);
  if (roomType) subParts.push(roomType);
  if (address) subParts.push(address);

  const details: Record<string, string> = {};
  if (address) details.address = address;
  if (roomType) details.room_type = roomType;
  if (score != null) details.review_score = String(score);

  const link = firstString(pick(r, "link", "url", "booking_link", "booking_url"));

  return {
    id: firstString(pick(r, "hotel_id", "id")) ?? crypto.randomUUID(),
    kind: "hotel",
    title: name,
    subtitle: subParts.join(" · ") || null,
    price,
    currency: price != null ? cur : null,
    link_url: link,
    image_url: photo,
    start_date: null,
    end_date: null,
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

  const currency = String(body.currency ?? "USD").trim() || "USD";
  const adults = Number(body.adults) > 0 ? Number(body.adults) : 2;
  const children = Number.isFinite(Number(body.children)) ? Number(body.children) : 2;
  const childAges = Array.isArray(body.child_ages)
    ? (body.child_ages as unknown[]).map((a) => Number(a)).filter((a) => Number.isFinite(a))
    : [];

  const reqBody: Record<string, unknown> = {
    destination,
    checkin_date: checkIn,
    checkout_date: checkOut,
    adults,
    children,
    currency,
  };
  if (childAges.length) reqBody.children_age = childAges;

  const data = await tryPost(HOTELS_HOST, [{ path: "/search", body: reqBody }], key);
  if (!data) return [];

  const list = findArray(
    data,
    "properties",
    "results",
    "hotels",
    "items",
    "data.hotels",
    "data.results",
    "data"
  );
  const results = list
    .map((h) => normalizeHotel(h, currency))
    .filter((r): r is Result => r !== null);
  for (const r of results) {
    r.start_date = checkIn;
    r.end_date = checkOut;
  }
  results.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
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
