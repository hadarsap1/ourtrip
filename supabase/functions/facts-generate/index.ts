// Generates the "הידעת" facts for ONE destination and stores them in
// destination_facts via the service role.
//
// A destination here is a stretch of the itinerary - (country_code,
// location_name) - not a country, because the trip visits Japan as eight
// separate places and Thailand as one 38-day block. See migration 00032.
//
// Deployed with verify_jwt=true, and the function additionally checks the
// caller resolves to an OWNER. Kids read these facts; they never generate
// them, so nothing a kid does can spend credit or change what the other kid
// reads.
//
// Structured output uses the forced tool_choice pattern, matching
// phrasebook-generate: robust across SDK and model versions.

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

type Fact = { emoji: string; fact: string };

const INPUT_SCHEMA = {
  type: "object",
  properties: {
    facts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          emoji: { type: "string", description: "One emoji that fits the fact." },
          fact: {
            type: "string",
            description:
              "The fact itself, in Hebrew, 1-2 short sentences a 7-year-old can read.",
          },
        },
        required: ["emoji", "fact"],
      },
    },
  },
  required: ["facts"],
} as const;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const HOW_MANY = 12;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const jsonHeaders = { "content-type": "application/json", ...CORS };
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: jsonHeaders });

  let body: { country_code?: string; location_name?: string };
  try {
    body = await req.json();
  } catch {
    return reply({ ok: false, error: "bad request" }, 400);
  }

  const countryCode = (body.country_code ?? "").trim().toUpperCase();
  const locationName = (body.location_name ?? "").trim();
  if (!/^[A-Z]{2}$/.test(countryCode) || locationName === "") {
    return reply({ ok: false, error: "bad destination" }, 400);
  }

  // caller must be an owner - resolved through the caller's own JWT
  const callerClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: {
        headers: { Authorization: req.headers.get("Authorization") ?? "" },
      },
    }
  );
  const { data: role } = await callerClient.rpc("current_member_role");
  if (role !== "owner") return reply({ ok: false, error: "forbidden" }, 403);

  if (!Deno.env.get("ANTHROPIC_API_KEY")) {
    return reply({ ok: false, error: "not_configured" }, 503);
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
  if (!trip) return reply({ ok: false, error: "no active trip" }, 409);

  const countryName =
    new Intl.DisplayNames(["en"], { type: "region" }).of(countryCode) ??
    countryCode;

  const anthropic = new Anthropic();

  let response;
  try {
    response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8000,
      tools: [
        {
          name: "emit_facts",
          description: "Return the facts for this destination.",
          input_schema: INPUT_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: "emit_facts" },
      messages: [
        {
          role: "user",
          content:
            `Write ${HOW_MANY} "did you know?" facts about ${locationName} in ` +
            `${countryName}, for two Hebrew-speaking children in early ` +
            `elementary school (ages about 6-9) who are travelling there with ` +
            `their parents.\n\n` +
            `The destination name is written in Hebrew and may be a region, a ` +
            `city, or a stretch of a trip. Interpret it as a place in ` +
            `${countryName} and write about that place. If part of the name is ` +
            `an itinerary label rather than a place, ignore that part.\n\n` +
            `Rules:\n` +
            `- Write in Hebrew, in simple words a 7-year-old can read alone. ` +
            `One or two short sentences per fact.\n` +
            `- ONLY well-established facts. If you are not confident something ` +
            `is true, leave it out and write a different fact instead. A short ` +
            `list of true facts is much better than a full list with an ` +
            `invented one - children will believe every word.\n` +
            `- Prefer things a child would find surprising or funny, and things ` +
            `they can actually see, hear, eat or count while they are there: ` +
            `animals, food, buildings, nature, how kids there go to school, ` +
            `games, festivals, trains, volcanoes, strange rules.\n` +
            `- Avoid war, killing, disaster details, politics and anything ` +
            `frightening. Historical background is fine if it is told gently.\n` +
            `- No numbers that change over time (populations, prices, ` +
            `"the tallest in the world"). Facts that stay true.\n` +
            `- Each fact gets one emoji that matches it.\n` +
            `- Do not repeat the same subject twice.\n\n` +
            `Call emit_facts with the list.`,
        },
      ],
    });
  } catch (err) {
    console.error("facts: anthropic call failed:", (err as Error).message);
    const message = (err as Error).message ?? "";
    // Out of credit is the one failure worth naming: the fix is topping up the
    // account, not retrying, and every other feature keeps working meanwhile.
    if (/credit balance is too low|insufficient/i.test(message)) {
      return reply({ ok: false, error: "no_credit" }, 402);
    }
    return reply({ ok: false, error: "ai_failed" }, 502);
  }

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return reply({ ok: false, error: "empty response" }, 502);
  }
  const facts = ((toolUse.input as { facts?: Fact[] }).facts ?? []).filter(
    (f) => typeof f?.fact === "string" && f.fact.trim() !== ""
  );
  if (facts.length === 0) return reply({ ok: false, error: "no facts" }, 502);

  // Regenerate replaces the AI batch for this destination and leaves anything a
  // parent wrote by hand untouched - otherwise pressing regenerate once would
  // silently destroy their edits.
  const { error: deleteError } = await service
    .from("destination_facts")
    .delete()
    .eq("trip_id", trip.id)
    .eq("country_code", countryCode)
    .eq("location_name", locationName)
    .eq("source", "ai");
  if (deleteError) return reply({ ok: false, error: deleteError.message }, 500);

  const { error: insertError } = await service.from("destination_facts").insert(
    facts.map((f, i) => ({
      trip_id: trip.id,
      country_code: countryCode,
      location_name: locationName,
      fact: f.fact.trim(),
      emoji: (f.emoji ?? "").trim() || null,
      sort_order: i,
      source: "ai",
    }))
  );
  if (insertError) return reply({ ok: false, error: insertError.message }, 500);

  return reply({ ok: true, count: facts.length });
});
