// Generates the country card of "הידעת" for ONE country - the flag and what it
// means, population, capital, language, currency, size next to Israel and a
// national animal or flower - and upserts it into country_profiles via the
// service role. One row per country, shown on every stretch of it (00089).
//
// Deployed with verify_jwt=true, and the function additionally checks the
// caller resolves to an OWNER, like facts-generate.
//
// Sonnet rather than Haiku on purpose: this is one call per country (six for
// the whole trip), and flag symbolism is exactly the kind of detail a small
// model invents with confidence. Kids believe every word.

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
        "What the flag looks like and why: what each colour and shape stands for. 2-4 short Hebrew sentences.",
    },
    population: {
      type: "string",
      description:
        'Rounded population and a comparison to Israel (about 10 million), e.g. "בערך 125 מיליון איש - פי 12 מישראל".',
    },
    capital: {
      type: "string",
      description: "The capital city, optionally with one short fun line.",
    },
    language: {
      type: "string",
      description: 'The main language(s), and how to say "hello" in it, written in Hebrew letters.',
    },
    currency: {
      type: "string",
      description: "The currency name in Hebrew, with one simple line a child understands.",
    },
    size_vs_israel: {
      type: "string",
      description:
        'Land area compared with Israel (about 22,000 square km), rounded, e.g. "גדולה מישראל פי 17".',
    },
    national_symbol: {
      type: "string",
      description:
        "A national animal or flower and one line about it. Empty string if the country has no well-known one.",
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
      max_tokens: 2000,
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
            `Write a short "country card" about ${countryName} (${countryCode}) ` +
            `for two Hebrew-speaking children aged about 6-9 who are travelling ` +
            `there with their parents.\n\n` +
            `Rules:\n` +
            `- Write in Hebrew, in simple words a 7-year-old can read alone.\n` +
            `- ONLY well-established facts. For the flag, explain the official ` +
            `or widely accepted meaning of its colours and symbols. If the ` +
            `meaning is disputed or unknown, say what it shows and that people ` +
            `tell different stories about it - never invent a meaning.\n` +
            `- Numbers are rounded and friendly ("בערך 70 מיליון"), and always ` +
            `compared with Israel so a child can feel the size. Israel has about ` +
            `10 million people and about 22,000 square km.\n` +
            `- Avoid war, killing, politics and anything frightening. If the ` +
            `flag's history involves a war, describe it gently ("the struggle to ` +
            `become independent") without violence.\n` +
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
