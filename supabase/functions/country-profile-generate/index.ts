// Generates the country card of "הידעת" for ONE country - the flag and what it
// means, population, capital, language, currency, size next to Israel and a
// national animal or flower - and upserts it into country_profiles via the
// service role. One row per country, shown on every stretch of it (00090).
//
// Deployed with verify_jwt=true, and the function additionally checks the
// caller resolves to an OWNER, like facts-generate.
//
// Sonnet rather than Haiku on purpose: this is one call per country (six for
// the whole trip), and flag symbolism is exactly the kind of detail a small
// model invents with confidence. The family reads every word as true.

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";
import { recordAi, reserveAi } from "../_shared/aiBudget.ts";

const FN = "country-profile-generate";
const MODEL = "claude-sonnet-5-5";

const FIELDS = [
  "flag_meaning",
  "population",
  "capital",
  "language",
  "currency",
  "size_vs_israel",
  "national_symbol",
] as const;
type Field = (typeof FIELDS)[number];

const INPUT_SCHEMA = {
  type: "object",
  properties: {
    flag_meaning: {
      type: "string",
      description:
        "What the flag looks like and why: what each colour and symbol stands for, when and how it was adopted, and any interesting story behind it. 3-5 Hebrew sentences.",
    },
    population: {
      type: "string",
      description:
        "Rounded population, a comparison to Israel (about 10 million), and one interesting detail about where or how people live.",
    },
    capital: {
      type: "string",
      description: "The capital city and one interesting detail about it (history, meaning of the name, what it is known for).",
    },
    language: {
      type: "string",
      description: 'The main language(s), something interesting about it (its script, its origin, tones), and how to say "hello" in it written in Hebrew letters.',
    },
    currency: {
      type: "string",
      description: "The currency name in Hebrew and one interesting detail (who appears on the notes, where the name comes from, a rough sense of its value against the shekel).",
    },
    size_vs_israel: {
      type: "string",
      description:
        "Land area compared with Israel (about 22,000 square km), rounded, plus one detail about its geography (islands, mountains, length from end to end).",
    },
    national_symbol: {
      type: "string",
      description:
        "A national animal or flower and why it was chosen or what it symbolises. Empty string if the country has no well-known one.",
    },
  },
  required: [...FIELDS],
} as const;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const jsonHeaders = { "content-type": "application/json", ...CORS };
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: jsonHeaders });

  let body: { country_code?: string };
  try {
    body = await req.json();
  } catch {
    return reply({ ok: false, error: "bad request" }, 400);
  }

  const countryCode = (body.country_code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return reply({ ok: false, error: "bad country" }, 400);
  }

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

  const gate = await reserveAi(callerClient, FN);
  if (!gate.ok) return reply({ ok: false, error: gate.error }, gate.status);

  const anthropic = new Anthropic();
  let response;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 3000,
      tools: [
        {
          name: "emit_country",
          description: "Return the country card.",
          input_schema: INPUT_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: "emit_country" },
      messages: [
        {
          role: "user",
          content:
            `Write a "country card" about ${countryName} (${countryCode}) for an ` +
            `Israeli family travelling there: two parents and two children in ` +
            `elementary school. The whole family reads it together, so pitch it ` +
            `like a good encyclopedia for curious 10-12 year olds - real content ` +
            `that an adult also finds interesting, not baby talk.\n\n` +
            `Rules:\n` +
            `- Write in clear, natural Hebrew. Proper vocabulary is fine; avoid ` +
            `academic jargon, slang and childish phrasing (exclamation marks, ` +
            `"וואו", explaining obvious words).\n` +
            `- Give substance: names, years, the reason behind things, a ` +
            `surprising detail. Prefer one specific, interesting fact over a ` +
            `generic statement.\n` +
            `- ONLY well-established facts. For the flag, give the official or ` +
            `widely accepted meaning of its colours and symbols and when it was ` +
            `adopted. If the meaning is disputed, say so and give the main ` +
            `interpretations - never invent one.\n` +
            `- Numbers are rounded ("בערך 125 מיליון") and compared with Israel, ` +
            `which has about 10 million people and about 22,000 square km.\n` +
            `- History, including independence and wars, may be mentioned ` +
            `factually and briefly, without graphic detail. Avoid current ` +
            `political controversy.\n` +
            `- No emoji in the text.\n\n` +
            `Call emit_country with the card.`,
        },
      ],
    });
  } catch (err) {
    const message = (err as Error).message ?? "";
    console.error("country-profile: anthropic call failed:", message);
    if (/credit balance is too low|insufficient/i.test(message)) {
      return reply({ ok: false, error: "no_credit" }, 402);
    }
    return reply({ ok: false, error: "ai_failed" }, 502);
  }

  await recordAi(gate.memberId, FN, [response]);

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return reply({ ok: false, error: "empty response" }, 502);
  }
  const input = toolUse.input as Partial<Record<Field, unknown>>;
  const row: Record<string, string | null> = {};
  for (const f of FIELDS) {
    const v = typeof input[f] === "string" ? (input[f] as string).trim() : "";
    row[f] = v === "" ? null : v;
  }
  if (!row.flag_meaning) return reply({ ok: false, error: "empty response" }, 502);

  const { error } = await service.from("country_profiles").upsert(
    {
      trip_id: trip.id,
      country_code: countryCode,
      ...row,
      source: "ai",
      updated_by: gate.memberId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "trip_id,country_code" }
  );
  if (error) return reply({ ok: false, error: error.message }, 500);

  return reply({ ok: true });
});
