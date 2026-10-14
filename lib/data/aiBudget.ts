// The trip's monthly AI budget (migration 00053). Owners only - RLS returns
// nothing to anyone else, and the Edge Functions enforce it via ai_reserve.

import { getSupabase } from "@/lib/supabase";

export const AI_BUDGET_DEFAULT_USD = 10;
export const AI_BUDGET_MAX_USD = 200;

function requireClient() {
  const client = getSupabase();
  if (!client) throw new Error("supabase_not_configured");
  return client;
}

export async function getAiBudget(tripId: string): Promise<number> {
  const { data, error } = await requireClient()
    .from("trip_ai_settings")
    .select("monthly_budget_usd")
    .eq("trip_id", tripId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? Number(data.monthly_budget_usd) : AI_BUDGET_DEFAULT_USD;
}

export async function setAiBudget(tripId: string, usd: number): Promise<void> {
  const { error } = await requireClient()
    .from("trip_ai_settings")
    .upsert({ trip_id: tripId, monthly_budget_usd: usd }, { onConflict: "trip_id" });
  if (error) throw new Error(error.message);
}

/** A typed amount as a budget, or null when it is not a number in range. */
export function parseAiBudget(raw: string): number | null {
  const n = Number(raw.trim().replace(",", "."));
  if (raw.trim() === "" || !Number.isFinite(n) || n < 0 || n > AI_BUDGET_MAX_USD) return null;
  return Math.round(n * 100) / 100;
}
