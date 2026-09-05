// Auto-fills the country-knowable parts of an emergency page (SPEC 2.12):
// local emergency numbers + the Israeli embassy/consulate. Owner-gated
// (verify_jwt=true + in-function role check). Only fills GENERIC fields that
// are currently empty - the owner's trip-specific fields (insurance, hotel,
// medical notes) are never touched. Triggered automatically when a country is
// added to the itinerary, and from a button on the emergency page.
//
// ACCURACY: the Israeli embassy is grounded in a curated list of RESIDENT
// missions (RESIDENT_EMBASSY) so the model can no longer default to a
// neighbouring country's embassy (the Portugal→Madrid bug). Emergency numbers
// for well-known countries come from EMERGENCY_NUMBERS; everything else is
// asked of the model with a strict "leave blank if unsure" instruction. The UI
// still shows a "verify against the official source" note.

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

// Cities with a RESIDENT Israeli embassy/mission (Hebrew name). Keeps the model
// from pointing at a neighbouring country. Best-effort but conservative - only
// entries we're confident about; unknown countries fall through to the model.
const RESIDENT_EMBASSY: Record<string, string> = {
  PT: "ליסבון", ES: "מדריד", FR: "פריז", IT: "רומא", DE: "ברלין", GB: "לונדון",
  NL: "האג", BE: "בריסל", AT: "וינה", CH: "ברן", GR: "אתונה", IE: "דבלין",
  SE: "שטוקהולם", NO: "אוסלו", DK: "קופנהגן", FI: "הלסינקי", PL: "ורשה",
  CZ: "פראג", HU: "בודפשט", RO: "בוקרשט", BG: "סופיה", RS: "בלגרד", HR: "זאגרב",
  UA: "קייב", TR: "אנקרה", CY: "ניקוסיה", RU: "מוסקבה", GE: "טביליסי",
  AZ: "באקו", KZ: "אסטנה", US: "וושינגטון", CA: "אוטווה", MX: "מקסיקו סיטי",
  BR: "ברזיליה", AR: "בואנוס איירס", CL: "סנטיאגו", PE: "לימה", CO: "בוגוטה",
  EC: "קיטו", UY: "מונטווידאו", PA: "פנמה סיטי", GT: "גואטמלה סיטי",
  JP: "טוקיו", CN: "בייג׳ינג", KR: "סיאול", IN: "ניו דלהי", TH: "בנגקוק",
  VN: "האנוי", PH: "מנילה", SG: "סינגפור", NP: "קטמנדו", MM: "יאנגון",
  AU: "קנברה", EG: "קהיר", JO: "עמאן", AE: "אבו דאבי", MA: "רבאט",
  ET: "אדיס אבבה", KE: "ניירובי", ZA: "פרטוריה", NG: "אבוג׳ה", RW: "קיגלי",
  AO: "לואנדה", CI: "אבידג׳אן", SN: "דקאר", GH: "אקרה",
};

// Emergency numbers for well-known countries. Most of Europe uses the single
// EU number 112 for all services. [police, ambulance, fire].
const EU_112 = ["112", "112", "112"] as const;
const EMERGENCY_NUMBERS: Record<string, readonly [string, string, string]> = {
  IL: ["100", "101", "102"], US: ["911", "911", "911"], CA: ["911", "911", "911"],
  GB: ["999", "999", "999"], AU: ["000", "000", "000"], NZ: ["111", "111", "111"],
  JP: ["110", "119", "119"], CN: ["110", "120", "119"], KR: ["112", "119", "119"],
  TW: ["110", "119", "119"], HK: ["999", "999", "999"], TH: ["191", "1669", "199"],
  SG: ["999", "995", "995"], MY: ["999", "999", "994"], VN: ["113", "115", "114"],
  ID: ["110", "119", "113"], PH: ["911", "911", "911"], IN: ["112", "102", "101"],
  NP: ["100", "102", "101"], AE: ["999", "998", "997"], QA: ["999", "999", "999"],
  SA: ["999", "997", "998"], JO: ["911", "911", "911"], TR: ["112", "112", "112"],
  EG: ["122", "123", "180"], ZA: ["10111", "10177", "10111"], KE: ["999", "999", "999"],
  MA: ["190", "150", "150"], BR: ["190", "192", "193"], AR: ["911", "911", "911"],
  CL: ["133", "131", "132"], PE: ["105", "106", "116"], CO: ["123", "123", "123"],
  MX: ["911", "911", "911"], UY: ["911", "911", "911"],
  // EU / EEA (single European emergency number)
  AT: EU_112, BE: EU_112, BG: EU_112, HR: EU_112, CY: EU_112, CZ: EU_112,
  DK: EU_112, EE: EU_112, FI: EU_112, FR: EU_112, DE: EU_112, GR: EU_112,
  HU: EU_112, IS: EU_112, IE: EU_112, IT: EU_112, LV: EU_112, LT: EU_112,
  LU: EU_112, MT: EU_112, NL: EU_112, NO: EU_112, PL: EU_112, PT: EU_112,
  RO: EU_112, SK: EU_112, SI: EU_112, ES: EU_112, SE: EU_112, CH: EU_112,
  RS: EU_112, UA: ["102", "103", "101"], GE: ["112", "112", "112"],
};

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
  const embassyCityHe = RESIDENT_EMBASSY[countryCode] ?? null;

  // Ask the model only for what we can't ground ourselves, and tell it the
  // exact resident embassy city when we know it so any phone/address it returns
  // is for the RIGHT mission (not a neighbouring country).
  const embassyInstruction = embassyCityHe
    ? `Israel HAS a resident embassy in ${countryNameEn}, in the city written in ` +
      `Hebrew as "${embassyCityHe}". For embassy_phone give THAT embassy's phone ` +
      `number if you are confident, otherwise "". For embassy_address give THAT ` +
      `embassy's street address in Hebrew if you are confident, otherwise "".`
    : `For embassy_phone / embassy_address: only if you are CONFIDENT whether ` +
      `Israel has a resident embassy in ${countryNameEn}. If it does, give that ` +
      `mission's phone and address (in Hebrew). If Israel has NO mission there, ` +
      `you may give the nearest accredited Israeli embassy and note in Hebrew ` +
      `which country it is in. If unsure, use "" - never guess.`;

  let response;
  try {
    response = await new Anthropic().messages.create({
      // Same model as the other functions (known-available on this key). The
      // curated grounding above is what makes the embassy accurate, so the
      // model only fills the long tail.
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
            `Standard traveler emergency information for ${countryNameEn} ` +
            `(${countryCode}), for an Israeli family.\n` +
            `- police / ambulance / fire: the local emergency phone numbers ` +
            `(digits only, e.g. "112"). Use "" if unsure.\n` +
            `- ${embassyInstruction}\n` +
            `Accuracy matters more than completeness: an empty field is far ` +
            `better than a wrong number or a wrong embassy. Call emit_emergency.`,
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

  // Prefer curated ground truth over the model for the fields we curate.
  const curatedNumbers = EMERGENCY_NUMBERS[countryCode];
  const resolved: Record<string, string> = {
    police: curatedNumbers?.[0] ?? (generated.police ?? "").trim(),
    ambulance: curatedNumbers?.[1] ?? (generated.ambulance ?? "").trim(),
    fire: curatedNumbers?.[2] ?? (generated.fire ?? "").trim(),
    embassy_phone: (generated.embassy_phone ?? "").trim(),
    // Curated city gives an accurate, non-inventable address when the model
    // isn't sure of the street; the model's fuller address wins if present.
    embassy_address:
      (generated.embassy_address ?? "").trim() ||
      (embassyCityHe ? `שגרירות ישראל, ${embassyCityHe}` : ""),
  };

  // merge: fill only generic fields that are currently empty; never touch the
  // owner's insurance / hotel / medical fields
  const merged: Record<string, string> = { ...existing };
  for (const field of GENERIC_FIELDS) {
    const current = (existing[field] ?? "").trim();
    const value = resolved[field];
    if (!current && value) merged[field] = value;
  }

  const { error } = await service
    .from("emergency_info")
    .upsert({ trip_id: trip.id, country_code: countryCode, content: merged });
  if (error) return json({ ok: false, error: error.message }, 500);

  return json({ ok: true, country_code: countryCode, content: merged });
});
