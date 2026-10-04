// Steps counter ingest (Phase 2). Called once a day by an Apple Shortcuts
// personal automation on a parent's iPhone: Health → today's step count →
// POST {"token", "steps", "date"} here. Setup guide: docs/STEPS-SHORTCUT.md.
//
// Deployed verify_jwt=false: the phone holds no Supabase key or session. It
// holds a per-phone token instead (step_tokens, SHA-256 hash only), created and
// revoked from the app's settings by a parent. Guards:
//   - kill switch STEPS_INGEST=off → 503;
//   - token must exist, be unrevoked, and belong to an OWNER (kids never);
//   - one post per phone per 20 s (429), steps 0..200000, date ±window;
//   - fails CLOSED if the tables are missing (503), never writes elsewhere;
//   - the answer never says whether a token exists (401 for any miss);
//   - logs outcome codes only - no token, no member, no step count.

import { createClient } from "npm:@supabase/supabase-js@2";
import { hashToken, parseIngest, tooSoon } from "../_shared/stepsIngest.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
  if (Deno.env.get("STEPS_INGEST") === "off") return json({ ok: false, error: "disabled" }, 503);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad_request" }, 400);
  }
  const parsed = parseIngest(body);
  if ("error" in parsed) {
    console.log(`steps-ingest: ${parsed.error}`);
    return json({ ok: false, error: parsed.error }, parsed.error === "bad_token" ? 401 : 400);
  }

  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: tok, error: tokError } = await service
    .from("step_tokens")
    .select("id, member_id, last_used_at, revoked_at")
    .eq("token_hash", await hashToken(parsed.token))
    .maybeSingle();
  if (tokError) {
    console.error("steps-ingest: step_tokens unavailable");
    return json({ ok: false, error: "not_configured" }, 503);
  }
  if (!tok || tok.revoked_at) {
    console.log("steps-ingest: unknown_or_revoked");
    return json({ ok: false, error: "bad_token" }, 401);
  }
  const { data: member } = await service.from("members").select("role").eq("id", tok.member_id).maybeSingle();
  if (member?.role !== "owner") {
    console.log("steps-ingest: not_owner");
    return json({ ok: false, error: "bad_token" }, 401);
  }
  if (tooSoon(tok.last_used_at)) return json({ ok: false, error: "rate_limited" }, 429);

  const now = new Date().toISOString();
  await service.from("step_tokens").update({ last_used_at: now }).eq("id", tok.id);
  const { error: upsertError } = await service
    .from("daily_steps")
    .upsert({ member_id: tok.member_id, date: parsed.date, steps: parsed.steps, updated_at: now });
  if (upsertError) {
    console.error("steps-ingest: daily_steps write failed");
    return json({ ok: false, error: "not_configured" }, 503);
  }
  console.log("steps-ingest: ok");
  return json({ ok: true, date: parsed.date, steps: parsed.steps });
});
