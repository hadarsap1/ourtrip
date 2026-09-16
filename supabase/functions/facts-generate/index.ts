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
//
// LEVEL: the readers are 8.5 and 6.5, and the first version of this prompt
// ("simple words a 7-year-old can read alone", one or two sentences, no
// numbers at all) produced facts they already knew. The prompt now aims at a
// curious 9-10 year old and demands a mechanism, real terminology and stable
// numbers. That is also why this function runs on Sonnet rather than Haiku:
// deeper facts need a model that actually holds the detail, and the cost is
// one generation per destination, pressed by a parent.

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
              "The fact itself, in Hebrew, 2-4 sentences, written for a " +
              "curious 9-year-old: it explains why or how something is the " +
              "way it is, not only that it is.",
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
      model: "claude-sonnet-5",
      max_tokens: 16000,
      // Sonnet thinks adaptively by default, and an Edge Function has a wall
      // clock. Medium effort keeps one destination well inside it - and the
      // whole-trip run is fourteen of these calls back to back.
      output_config: { effort: "medium" },
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
            `${countryName}, in Hebrew, for two curious children travelling ` +
            `there with their parents: one is 8.5 and reads alone, one is 6.5 ` +
            `and is read to by a parent.\n\n` +
            `LEVEL - the most important instruction. Aim at a bright, curious ` +
            `9-to-10-year-old, not at a preschooler. Each fact must teach ` +
            `something they did not know and could repeat to an adult at ` +
            `dinner. A fact a five-year-old already knows, or one that would ` +
            `be just as true of almost any city on earth, is a failed fact - ` +
            `drop it and write a real one instead.\n\n` +
            `The destination name is written in Hebrew and may be a region, a ` +
            `city, or a stretch of a trip. Interpret it as a place in ` +
            `${countryName} and write about that place. If part of the name is ` +
            `an itinerary label rather than a place, ignore that part.\n\n` +
            `Rules:\n` +
            `- Write in Hebrew, 2-4 sentences per fact. Clear, precise ` +
            `language - clear is not the same as babyish.\n` +
            `- Explain WHY or HOW, not only THAT. A fact that states a bare ` +
            `claim without the mechanism, the cause or the story behind it is ` +
            `half a fact. "Why is it like that?" should already be answered.\n` +
            `- Use the real term for things - tectonic plates, monsoon, ` +
            `fermentation, aqueduct, endemic, dynasty, archipelago - and gloss ` +
            `it in a few words the first time it appears. Children learn words ` +
            `from being given them, not from having them avoided.\n` +
            `- Concrete numbers are welcome when they are stable: heights, ` +
            `depths, distances, dates, centuries, how many years something ` +
            `took to build, how long an animal lives. Skip anything that ` +
            `drifts year to year - populations, prices, visitor counts, ` +
            `"the tallest in the world".\n` +
            `- Be specific to THIS place. Name the actual mountain, temple, ` +
            `river, animal species, dish, era or person. No generic national ` +
            `trivia that a guidebook would print for the whole country.\n` +
            `- Spread the ${HOW_MANY} facts across at least five different ` +
            `worlds: geology and landscape, animals and plants, history and ` +
            `archaeology, science and engineering, language and writing, food ` +
            `and how it is made, daily life and school, art, religion and ` +
            `festivals. Do not repeat a subject.\n` +
            `- ONLY well-established facts. If you are not fully confident ` +
            `something is true, leave it out and write a different fact ` +
            `instead. A short list of true facts is much better than a full ` +
            `list with an invented one - children will believe every word, ` +
            `and a number that sounds precise is believed twice as hard.\n` +
            `- Tone: tell it straight, the way a good museum label or a ` +
            `science book for children does. No exclamation-mark hype, no ` +
            `"וואו", no "מגניב", no rhetorical questions aimed at the ` +
            `child, no praising the fact instead of telling it.\n` +
            `- Keep it sober and non-frightening: no gore, no graphic violence ` +
            `or disaster detail, no present-day politics. Hard history ` +
            `(an eruption, a war, an empire) may be mentioned plainly and ` +
            `briefly when it is genuinely part of the place.\n` +
            `- Each fact gets one emoji that matches it.\n\n` +
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
