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
            `Create a practical travel phrasebook for a Hebrew-speaking family ` +
            `(two parents, two young kids) visiting a country where ${languageName} ` +
            `("${language}") is spoken. Produce 40-55 short, genuinely useful phrases ` +
            `covering all of these Hebrew categories: ברכות, נימוסים, כיוונים והתמצאות, ` +
            `אוכל ומסעדות, קניות וכסף, תחבורה, חירום ובריאות, עם ילדים.\n\n` +
            `For each phrase provide:\n` +
            `- phrase_he: the phrase in natural Hebrew\n` +
            `- phrase_local: the phrase in ${languageName}, in the native script\n` +
            `- phonetic_he: pronunciation transliterated into Hebrew letters, ` +
            `readable aloud by a Hebrew speaker with no knowledge of ${languageName}\n\n` +
            `Include child-relevant needs (bathroom, allergies, "where is the ` +
            `playground", kids menu) and emergency basics (help, doctor, police, ` +
            `pharmacy). Keep phrases short and speakable. Call emit_phrasebook with ` +
            `the entries.`,
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

  // regenerate = replace: clear the language's previous entries, then insert
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
    entries.map((e) => ({
      trip_id: trip.id,
      language,
      country_code: countryCode,
      category: e.category,
      phrase_he: e.phrase_he,
      phrase_local: e.phrase_local,
      phonetic_he: e.phonetic_he || null,
    }))
  );
  if (insertError) {
    return new Response(JSON.stringify({ ok: false, error: insertError.message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  return new Response(
    JSON.stringify({ ok: true, language, count: entries.length }),
    { headers: jsonHeaders }
  );
});
