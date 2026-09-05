// Generates a phrasebook for one destination language (SPEC 2.8) with the
// Claude API and stores it in phrasebook_entries via the service role.
// Deployed with verify_jwt=true; additionally the function verifies the
// caller resolves to an OWNER member before doing anything (kids get
// read-only phrasebook access in Sprint 6; generation stays owner-only).
//
// Structured output uses the tool-use pattern (forced tool_choice): robust
// across SDK/model versions, unlike the newer output_config format.

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";
import { cleanPhonetic, isUsableHebrew } from "../_shared/phonetic.ts";

type Entry = {
  category: string;
  phrase_he: string;
  phrase_local: string;
  phonetic_he: string;
};

const INPUT_SCHEMA = {
  type: "object",
  properties: {
    entries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: [
              "ברכות",
              "נימוסים",
              "כיוונים והתמצאות",
              "אוכל ומסעדות",
              "קניות וכסף",
              "תחבורה",
              "חירום ובריאות",
              "עם ילדים",
            ],
          },
          phrase_he: { type: "string" },
          phrase_local: { type: "string" },
          phonetic_he: { type: "string" },
        },
        required: ["category", "phrase_he", "phrase_local", "phonetic_he"],
      },
    },
  },
  required: ["entries"],
} as const;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const jsonHeaders = { "content-type": "application/json", ...CORS };

  let body: { language?: string; country_code?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "bad request" }), {
      status: 400,
      headers: jsonHeaders,
    });
  }
  const language = (body.language ?? "").trim().toLowerCase();
  const countryCode = (body.country_code ?? "").trim().toUpperCase() || null;
  if (!/^[a-z]{2,3}$/.test(language)) {
    return new Response(JSON.stringify({ ok: false, error: "bad language" }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  // caller must be an owner - resolve via the caller's own JWT + RLS helpers
  const authHeader = req.headers.get("Authorization") ?? "";
  const callerClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: role } = await callerClient.rpc("current_member_role");
  if (role !== "owner") {
    return new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
      status: 403,
      headers: jsonHeaders,
    });
  }

  // clear, specific error when the AI key isn't configured
  if (!Deno.env.get("ANTHROPIC_API_KEY")) {
    return new Response(JSON.stringify({ ok: false, error: "not_configured" }), {
      status: 503,
      headers: jsonHeaders,
    });
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
  if (!trip) {
    return new Response(JSON.stringify({ ok: false, error: "no active trip" }), {
      status: 409,
      headers: jsonHeaders,
    });
  }

  const anthropic = new Anthropic(); // ANTHROPIC_API_KEY from function secrets

  const languageName = new Intl.DisplayNames(["en"], { type: "language" })
    .of(language) ?? language;

  let response;
  try {
    response = await anthropic.messages.create({
      // Haiku 4.5: fast enough that a 40-55 phrase book returns in seconds
      // rather than the minute-plus Opus took (which read as a hang).
      model: "claude-haiku-4-5-20251001",
      max_tokens: 16000,
      tools: [
        {
          name: "emit_phrasebook",
          description: "Return the full phrasebook.",
          input_schema: INPUT_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: "emit_phrasebook" },
      messages: [
        {
          role: "user",
          content:
            `Create a practical travel phrasebook in ${languageName} ("${language}") ` +
            `for a Hebrew-speaking family: two parents and two children of early ` +
            `primary-school age, roughly 6 to 9 years old.\n\n` +
            `THE FAMILY. The children walk, talk, eat ordinary food and use ` +
            `ordinary toilets. There is NO baby: no nappies, no pram or stroller, ` +
            `no nursing or feeding room, no baby food, no highchair. Nobody in ` +
            `the family has a food allergy, so do NOT produce "I am allergic ` +
            `to..." phrases - that space is better spent on things they will ` +
            `actually say.\n\n` +
            `Produce 40-55 short, genuinely useful phrases across these Hebrew ` +
            `categories: ברכות, נימוסים, כיוונים והתמצאות, אוכל ומסעדות, ` +
            `קניות וכסף, תחבורה, חירום ובריאות, עם ילדים.\n\n` +
            `For each phrase:\n` +
            `- phrase_he: the phrase in natural, current, spoken Hebrew\n` +
            `- phrase_local: the SAME phrase in ${languageName}, native script\n` +
            `- phonetic_he: how to say it, in Hebrew letters\n\n` +
            `THREE RULES THAT MATTER MORE THAN COVERAGE. Breaking any of them ` +
            `makes an entry worse than missing, because it will be read out to a ` +
            `stranger and believed.\n\n` +
            `1. phrase_he and phrase_local MUST mean the same thing. Not close, ` +
            `the same. Do not write "I am allergic to animals" in Hebrew beside ` +
            `"I am allergic to shrimp" in the local language, and do not write a ` +
            `Hebrew statement beside a local question.\n\n` +
            `2. phonetic_he must contain ONLY Hebrew letters, spaces and simple ` +
            `punctuation. NEVER a character of ${languageName}'s own script. It ` +
            `exists so someone who cannot read that script can say the words ` +
            `aloud; a single foreign glyph makes the whole field useless. If you ` +
            `cannot transliterate a sound into Hebrew letters, choose the nearest ` +
            `Hebrew sound - never fall back to the original character.\n\n` +
            `3. phrase_he must be Hebrew a person actually says today. Not ` +
            `literary or archaic ("בית הכסא"), not a word that does not exist, ` +
            `and not a mistyped one. Say "שירותים", "שלשול", "עגלת תינוק", ` +
            `"האוכל טעים". Re-read every Hebrew line and ask whether an Israeli ` +
            `would say it out loud.\n\n` +
            `Cover what this family will really need: ordering food and asking ` +
            `what is in it, "not spicy please", toilets, directions, prices and ` +
            `bargaining, buses trains and taxis, tickets, checking in, and the ` +
            `emergency basics - doctor, pharmacy, police, fever, stomach ache, ` +
            `"my child is lost", "we need help". For the children's category ` +
            `think playgrounds, toilets, "is this safe for children", a children's ` +
            `menu, and asking an adult for help - not baby equipment.\n\n` +
            `Keep phrases short and speakable. Call emit_phrasebook with the entries.`,
        },
      ],
    });
  } catch (err) {
    console.error("phrasebook: anthropic call failed:", (err as Error).message);
    return new Response(JSON.stringify({ ok: false, error: "ai_failed" }), {
      status: 502,
      headers: jsonHeaders,
    });
  }

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return new Response(JSON.stringify({ ok: false, error: "empty response" }), {
      status: 502,
      headers: jsonHeaders,
    });
  }
  const entries = ((toolUse.input as { entries?: Entry[] }).entries) ?? [];
  if (!Array.isArray(entries) || entries.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: "no entries" }), {
      status: 502,
      headers: jsonHeaders,
    });
  }

  // Last line of defence on the two rules above. A phrase that lost its Hebrew
  // is dropped; a transliteration carrying the source script is stored as null
  // rather than scrubbed, because a scrubbed one reads as though it had been
  // checked. See _shared/phonetic.ts.
  const usable = entries.filter((e) => isUsableHebrew(e.phrase_he) && e.phrase_local?.trim());
  if (usable.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: "no entries" }), {
      status: 502,
      headers: jsonHeaders,
    });
  }

  // Only now, with a usable batch in hand: regenerate = replace. Doing this
  // before the checks above would let one bad generation wipe a working
  // phrasebook and put nothing back in its place.
  const { error: deleteError } = await service
    .from("phrasebook_entries")
    .delete()
    .eq("trip_id", trip.id)
    .eq("language", language);
  if (deleteError) {
    return new Response(JSON.stringify({ ok: false, error: deleteError.message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  const { error: insertError } = await service.from("phrasebook_entries").insert(
    usable.map((e) => ({
      trip_id: trip.id,
      language,
      country_code: countryCode,
      category: e.category,
      phrase_he: e.phrase_he.trim(),
      phrase_local: e.phrase_local.trim(),
      phonetic_he: cleanPhonetic(e.phonetic_he),
    }))
  );
  if (insertError) {
    return new Response(JSON.stringify({ ok: false, error: insertError.message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  return new Response(
    // The number actually stored, not the number the model offered.
    JSON.stringify({ ok: true, language, count: usable.length }),
    { headers: jsonHeaders }
  );
});
