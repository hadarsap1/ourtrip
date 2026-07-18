// Auto-fills the country-knowable parts of an emergency page (SPEC 2.12):
// local emergency numbers + the Israeli embassy/consulate. Owner-gated
// (verify_jwt=true + in-function role check). Only fills GENERIC fields that
// are currently empty — the owner's trip-specific fields (insurance, hotel,
// medical notes) are never touched. Triggered automatically when a country is
// added to the itinerary, and from a button on the emergency page.

import Anthropic from "npm:@anthropic-ai/sdk";
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

const GENERIC_FIELDS = ["police", "ambulance", "fire", "embassy_phone", "embassy_address"] as const;

const INPUT_SCHEMA = {
  type: "object",
  properties: {
    police: { type: "string" },
    ambulance: { type: "string" },
    fire: { type: "string" },
    embassy_phone: { type: "string" },
    embassy_address: { type: "string" },
  },
  required: ["police", "ambulance", "fire", "embassy_phone", "embassy_address"],
} as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let body: { country_code?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad request" }, 400);
  }
  const countryCode = (body.country_code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return json({ ok: false, error: "bad country" }, 400);
  }

  // owner gate
  const caller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
  );
  const { data: role } = await caller.rpc("current_member_role");
  if (role !== "owner") return json({ ok: false, error: "forbidden" }, 403);

  if (!Deno.env.get("ANTHROPIC_API_KEY")) {
    return json({ ok: false, error: "not_configured" }, 503);
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

  const { data: existingRow } = await service
    .from("emergency_info")
    .select("content")
    .eq("trip_id", trip.id)
    .eq("country_code", countryCode)
    .maybeSingle();
  const existing = (existingRow?.content ?? {}) as Record<string, string>;

  const countryNameEn =
    new Intl.DisplayNames(["en"], { type: "region" }).of(countryCode) ?? countryCode;

  let response;
  try {
    response = await new Anthropic().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      tools: [
        {
          name: "emit_emergency",
          description: "Return the country's traveler emergency info.",
          input_schema: INPUT_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: "emit_emergency" },
      messages: [
        {
          role: "user",
          content:
            `Provide standard traveler emergency information for ${countryNameEn} ` +
            `(${countryCode}), for an Israeli family.\n` +
            `- police / ambulance / fire: the local emergency phone numbers ` +
            `(digits only, e.g. "100"; use the single European number 112 where ` +
            `that is what's used).\n` +
            `- embassy_phone: the phone of the Israeli embassy or consulate in ` +
            `${countryNameEn} (if Israel has no mission there, the nearest ` +
            `accredited Israeli embassy).\n` +
            `- embassy_address: that embassy's address. Write it in Hebrew, and ` +
            `note in Hebrew if it is the embassy in a NEIGHBORING country.\n` +
            `Use empty strings for anything you are not reasonably sure of — do ` +
            `not invent phone numbers. Call emit_emergency.`,
        },
      ],
    });
  } catch (err) {
    console.error("emergency-autofill: anthropic failed:", (err as Error).message);
    return json({ ok: false, error: "ai_failed" }, 502);
  }

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return json({ ok: false, error: "no output" }, 502);
  }
  const generated = toolUse.input as Record<string, string>;

  // merge: fill only generic fields that are currently empty; never touch
  // the owner's insurance / hotel / medical fields
  const merged: Record<string, string> = { ...existing };
  for (const field of GENERIC_FIELDS) {
    const current = (existing[field] ?? "").trim();
    const value = (generated[field] ?? "").trim();
    if (!current && value) merged[field] = value;
  }

  const { error } = await service
    .from("emergency_info")
    .upsert({ trip_id: trip.id, country_code: countryCode, content: merged });
  if (error) return json({ ok: false, error: error.message }, 500);

  return json({ ok: true, country_code: countryCode, content: merged });
});
