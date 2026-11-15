// Hand corrections of the cash wallet (00092, DECISIONS #61). Owners only by
// RLS (cash_adjustments_owner_all). A correction moves only the wallet, never
// the budget totals (lib/budget.ts cashWallets).

import { getSupabase } from "@/lib/supabase";
import { getActiveTrip, getCurrentMember } from "@/lib/data/trip";
import type { CashAdjustment } from "@/lib/types";

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

export async function listCashAdjustments(tripId: string): Promise<CashAdjustment[]> {
  const { data, error } = await requireClient()
    .from("cash_adjustments")
    .select("*")
    .eq("trip_id", tripId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return data;
}

/** Sets the wallet of `currency` to `balance`; `delta` is how far that moves
 *  it from what the app computed (adjustmentDelta). Online only. */
export async function addCashAdjustment(input: { currency: string; balance: number; delta: number }): Promise<void> {
  const [trip, member] = await Promise.all([getActiveTrip(), getCurrentMember()]);
  if (!trip || !member) throw new Error("missing context");
  const { error } = await requireClient().from("cash_adjustments").insert({
    trip_id: trip.id,
    currency: input.currency,
    balance: input.balance,
    delta: input.delta,
    created_by: member.id,
  });
  if (error) throw new Error(error.message);
}

/** Undo: the wallet goes back to what the expenses and withdrawals say. */
export async function deleteCashAdjustment(id: string): Promise<void> {
  const { error } = await requireClient().from("cash_adjustments").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
