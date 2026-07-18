// Sprint 8 — "מה בסביבה" local recommendations (SPEC 2.8). Owner-gated
// (deployed verify_jwt=true; additionally re-checks role='owner' in-function,
// same pattern as phrasebook-generate). Google Places supplies real nearby
// candidates when GOOGLE_MAPS_API_KEY is set; Claude curates + describes them
// in Hebrew with a kid-friendly bias. With no Places key it degrades to a
// knowledge-only answer from the coordinates + area name — the feature never
// blocks. Results are ephemeral: the client saves the ones it wants into the
// itinerary or the maybe-list (saved_recommendations).

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type Candidate = {
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  place_id: string | null;
};

const SCHEMA = {
  type: "object",
  properties: {
    recommendations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          candidate_index: { type: ["integer", "null"] },
          title: { type: "string" },
          category: {
            type: "string",
            enum: ["מסעדה", "אטרקציה", "פארק", "מוזיאון", "חנות", "טיפ"],
          },
          description: { type: "string" },
          location_name: { type: "string" },
          lat: { type: ["number", "null"] },
          lng: { type: ["number", "null"] },
        },
        required: [
          "candidate_index",
          "title",
          "category",
          "description",
          "location_name",
          "lat",
          "lng",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["recommendations"],
  additionalProperties: false,
} as const;

/** Google Places Nearby Search for kid-relevant candidates around a point. */
async function fetchPlaces(
  key: string,
  lat: number,
  lng: number
): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const type of ["restaurant", "tourist_attraction"]) {
    try {
      const url =
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?` +
        `location=${lat},${lng}&radius=2500&type=${type}&language=he&key=${key}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      for (const r of (data.results ?? []).slice(0, 10)) {
        out.push({
          name: r.name,
          address: r.vicinity ?? r.formatted_address ?? "",
          lat: r.geometry?.location?.lat ?? null,
          lng: r.geometry?.location?.lng ?? null,
          place_id: r.place_id ?? null,
        });
      }
    } catch {
      // one type failed — keep whatever we have
    }
  }
  return out;
}

function mapsUrl(
  lat: number | null,
  lng: number | null,
  placeId: string | null,
  query: string
): string {
  if (lat != null && lng != null) {
    const base = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    return placeId ? `${base}&query_place_id=${placeId}` : base;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

Deno.serve(async (req) => {
  let body: {
    lat?: number;
    lng?: number;
    area_name?: string;
    country_code?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad request" }, 400);
  }
  const lat = typeof body.lat === "number" ? body.lat : null;
  const lng = typeof body.lng === "number" ? body.lng : null;
  const areaName = (body.area_name ?? "").trim();
  const countryCode = (body.country_code ?? "").trim().toUpperCase() || null;
  if (lat === null && !areaName) {
    return json({ ok: false, error: "location required" }, 400);
  }

  // owner gate (caller's own JWT + RLS helper)
  const caller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
  );
  const { data: role } = await caller.rpc("current_member_role");
  if (role !== "owner") return json({ ok: false, error: "forbidden" }, 403);

  // real nearby candidates (best-effort)
  const placesKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  const candidates =
    placesKey && lat !== null && lng !== null
      ? await fetchPlaces(placesKey, lat, lng)
      : [];

  const anthropic = new Anthropic(); // ANTHROPIC_API_KEY from function secrets
  const whereText =
    (areaName ? areaName : "") +
    (lat !== null ? ` (${lat.toFixed(4)}, ${lng!.toFixed(4)})` : "") +
    (countryCode ? `, ${countryCode}` : "");

  const candidateBlock =
    candidates.length > 0
      ? `Here are real nearby places from Google Places (index — name — address):\n` +
        candidates.map((c, i) => `${i}. ${c.name} — ${c.address}`).join("\n") +
        `\n\nChoose the 6-8 best of these for a family with two young kids. ` +
        `Set candidate_index to the number of the place you chose and copy its ` +
        `name into title. You MAY also add up to 2 general tips (category "טיפ", ` +
        `candidate_index null).`
      : `No live place list is available. From your own knowledge of this area, ` +
        `suggest 6-8 real, specific, currently-known family spots. Set ` +
        `candidate_index to null for every item and fill lat/lng if you are ` +
        `confident, otherwise null.`;

  const response = await anthropic.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 4000,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [
      {
        role: "user",
        content:
          `A Hebrew-speaking family (two parents + two early-elementary kids) is ` +
          `near: ${whereText}. Recommend kid-friendly things nearby: restaurants ` +
          `(kids menu / relaxed), attractions, parks, museums, plus a couple of ` +
          `practical local tips.\n\n${candidateBlock}\n\n` +
          `Write ALL of title, category, description and location_name in Hebrew. ` +
          `In description (1-2 sentences) say what it is and why it suits young ` +
          `kids. Keep it warm and concrete.`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    return json({ ok: false, error: "generation refused" }, 502);
  }
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return json({ ok: false, error: "empty response" }, 502);
  }

  type Raw = {
    candidate_index: number | null;
    title: string;
    category: string;
    description: string;
    location_name: string;
    lat: number | null;
    lng: number | null;
  };
  let raw: Raw[];
  try {
    raw = (JSON.parse(textBlock.text) as { recommendations: Raw[] }).recommendations;
  } catch {
    return json({ ok: false, error: "unparseable output" }, 502);
  }

  const recommendations = raw.map((r) => {
    const c =
      r.candidate_index !== null && candidates[r.candidate_index]
        ? candidates[r.candidate_index]
        : null;
    const rLat = c?.lat ?? r.lat;
    const rLng = c?.lng ?? r.lng;
    const placeId = c?.place_id ?? null;
    return {
      title: r.title,
      category: r.category,
      description: r.description,
      location_name: c?.address || r.location_name,
      lat: rLat,
      lng: rLng,
      place_id: placeId,
      country_code: countryCode,
      maps_url: mapsUrl(rLat, rLng, placeId, `${r.title} ${r.location_name}`),
    };
  });

  return json({ ok: true, recommendations, source: candidates.length > 0 ? "places+claude" : "claude" });
});
