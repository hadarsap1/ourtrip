// The monthly AI budget gate (00053), shared by every function that calls the
// Claude API:
//
//   const gate = await reserveAi(caller, FN);       // before the model call
//   if (!gate.ok) return json({ ok: false, error: gate.error }, gate.status);
//   ...
//   await recordAi(gate.memberId, FN, response.model, response.usage);  // after
//
// reserveAi runs as the calling parent (their JWT), so the database decides
// who they are; recordAi writes with the service role. Both fail CLOSED on the
// way in - no budget check, no model call - and recordAi only logs if it fails
// on the way out (the call already happened; the counted call stays).

import { createClient } from "npm:@supabase/supabase-js@2";
import { AI_DAILY_CAPS, costUsd, inputTokens, type AiUsage } from "./aiCost.ts";

type RpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

export type AiGate =
  | { ok: true; memberId: string; callsLeftToday: number }
  | { ok: false; status: number; error: "forbidden" | "ai_budget" | "ai_daily_limit" | "not_configured" };

export async function reserveAi(caller: RpcClient, fn: string): Promise<AiGate> {
  const cap = AI_DAILY_CAPS[fn];
  if (!cap) {
    console.error(`${fn}: no daily cap defined`);
    return { ok: false, status: 503, error: "not_configured" };
  }
  const { data, error } = await caller.rpc("ai_reserve", { p_fn: fn, p_daily_cap: cap });
  if (error || !data || typeof data !== "object") {
    console.error(`${fn}: ai_reserve unavailable`);
    return { ok: false, status: 503, error: "not_configured" };
  }
  const r = data as { ok?: boolean; reason?: string; member_id?: string; calls_left_today?: number };
  if (r.ok && r.member_id) return { ok: true, memberId: r.member_id, callsLeftToday: r.calls_left_today ?? 0 };
  if (r.reason === "ai_budget" || r.reason === "ai_daily_limit") {
    console.log(`${fn}: blocked (${r.reason})`);
    return { ok: false, status: 429, error: r.reason };
  }
  return { ok: false, status: 403, error: "forbidden" };
}

/** Adds one or more responses' usage to today's row. Pass every response the
 *  call produced (extract-places makes one per chunk). */
export async function recordAi(
  memberId: string,
  fn: string,
  responses: { model: string; usage?: AiUsage | null }[]
): Promise<void> {
  let input = 0;
  let output = 0;
  let cost = 0;
  for (const r of responses) {
    input += inputTokens(r.usage);
    output += r.usage?.output_tokens && r.usage.output_tokens > 0 ? r.usage.output_tokens : 0;
    cost += costUsd(r.model, r.usage);
  }
  if (responses.length === 0) return;
  try {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { error } = await service.rpc("ai_record", {
      p_member_id: memberId,
      p_fn: fn,
      p_input_tokens: input,
      p_output_tokens: output,
      p_cost_usd: Number(cost.toFixed(6)),
    });
    if (error) console.error(`${fn}: ai_record failed`);
  } catch {
    console.error(`${fn}: ai_record failed`);
  }
}
