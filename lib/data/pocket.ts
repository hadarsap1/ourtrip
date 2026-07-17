import { getSupabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";

export type PocketMoney = Tables<"pocket_money">;
export type PocketExpense = Tables<"pocket_expenses">;

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

/** RLS scopes rows: kid sees own, owner sees all kids. */
export async function listPocketMoney(tripId: string): Promise<PocketMoney[]> {
  const { data, error } = await requireClient()
    .from("pocket_money")
    .select("*")
    .eq("trip_id", tripId);
  if (error) throw new Error(error.message);
  return data;
}

export async function setAllowance(
  tripId: string,
  kidId: string,
  allowance: number
): Promise<void> {
  const { error } = await requireClient()
    .from("pocket_money")
    .upsert(
      { trip_id: tripId, kid_id: kidId, allowance, currency: "ILS" },
      { onConflict: "trip_id,kid_id" }
    );
  if (error) throw new Error(error.message);
}

export async function listPocketExpenses(tripId: string): Promise<PocketExpense[]> {
  const { data, error } = await requireClient()
    .from("pocket_expenses")
    .select("*")
    .eq("trip_id", tripId)
    .order("spent_on", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function addPocketExpense(input: {
  tripId: string;
  kidId: string;
  amount: number;
  description: string | null;
}): Promise<void> {
  const { error } = await requireClient().from("pocket_expenses").insert({
    trip_id: input.tripId,
    kid_id: input.kidId,
    amount: input.amount,
    description: input.description?.trim() || null,
  });
  if (error) throw new Error(error.message);
}

export async function deletePocketExpense(id: string): Promise<void> {
  const { error } = await requireClient()
    .from("pocket_expenses")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}
