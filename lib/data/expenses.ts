import { getSupabase } from "@/lib/supabase";
import { todayISO } from "@/lib/format";
import { getActiveTrip, getCurrentMember } from "@/lib/data/trip";
import type { TablesUpdate } from "@/lib/database.types";
import type { Booking, BudgetCategory, Expense } from "@/lib/types";

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

export async function listCategories(
  tripId: string
): Promise<BudgetCategory[]> {
  const { data, error } = await requireClient()
    .from("budget_categories")
    .select("*")
    .eq("trip_id", tripId)
    .order("key");
  if (error) throw new Error(error.message);
  return data;
}

/**
 * ILS rate for a given day (DECISIONS #7 order): the day's cached rate in
 * fx_rates (populated daily by the fx-daily Edge Function) → live providers
 * (open.er-api.com, then Frankfurter) → last known cached rate.
 */
export async function getRateToIls(
  currency: string,
  day: string = todayISO()
): Promise<number | null> {
  if (currency === "ILS") return 1;

  const cached = getSupabase();
  if (cached) {
    const { data } = await cached
      .from("fx_rates")
      .select("rate_to_ils")
      .eq("day", day)
      .eq("currency", currency)
      .maybeSingle();
    if (data) return data.rate_to_ils;
  }

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/ILS");
    if (res.ok) {
      const json = await res.json();
      const rate = json?.rates?.[currency];
      if (typeof rate === "number" && rate > 0) return 1 / rate;
    }
  } catch {
    // fall through to next provider
  }

  try {
    const res = await fetch(
      `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(currency)}&symbols=ILS`
    );
    if (res.ok) {
      const json = await res.json();
      const rate = json?.rates?.ILS;
      if (typeof rate === "number" && rate > 0) return rate;
    }
  } catch {
    // fall through to last known rate
  }

  const supabase = getSupabase();
  if (supabase) {
    const { data } = await supabase
      .from("fx_rates")
      .select("rate_to_ils")
      .eq("currency", currency)
      .order("day", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data.rate_to_ils;
  }
  return null;
}

export async function updateCategoryPlanned(
  categoryId: string,
  plannedAmount: number
): Promise<void> {
  const { error } = await requireClient()
    .from("budget_categories")
    .update({ planned_amount: plannedAmount })
    .eq("id", categoryId);
  if (error) throw new Error(error.message);
}

// ---------- expenses ----------

export async function listExpenses(tripId: string): Promise<Expense[]> {
  const { data, error } = await requireClient()
    .from("expenses")
    .select("*")
    .eq("trip_id", tripId)
    .order("spent_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

/** Fast entry: converts at the spent_on day's rate. Throws "fx" when the
 *  currency can't be converted (UI shows a specific Hebrew message). */
export async function createExpense(input: {
  categoryId: string;
  amount: number;
  currency: string;
  description?: string | null;
  spentOn?: string;
}): Promise<void> {
  const supabase = requireClient();
  const [trip, member] = await Promise.all([
    getActiveTrip(),
    getCurrentMember(),
  ]);
  if (!trip || !member) throw new Error("missing expense context");

  const spentOn = input.spentOn ?? todayISO();
  const rate = await getRateToIls(input.currency, spentOn);
  if (rate == null) throw new Error("fx");

  const { error } = await supabase.from("expenses").insert({
    trip_id: trip.id,
    category_id: input.categoryId,
    amount: input.amount,
    currency: input.currency,
    amount_ils: Math.round(input.amount * rate * 100) / 100,
    description: input.description?.trim() || null,
    spent_on: spentOn,
    created_by: member.id,
  });
  if (error) throw new Error(error.message);
}

/** Re-converts when amount/currency/date changed. */
export async function updateExpense(
  id: string,
  patch: Pick<TablesUpdate<"expenses">, "category_id" | "description"> & {
    amount: number;
    currency: string;
    spent_on: string;
  }
): Promise<void> {
  const rate = await getRateToIls(patch.currency, patch.spent_on);
  if (rate == null) throw new Error("fx");
  const { error } = await requireClient()
    .from("expenses")
    .update({
      ...patch,
      amount_ils: Math.round(patch.amount * rate * 100) / 100,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await requireClient().from("expenses").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Creates the budget expense linked to a booking. Throws "fx" when the
 *  currency can't be converted (UI shows a specific Hebrew message). */
export async function createExpenseForBooking(
  booking: Booking,
  categoryId: string
): Promise<void> {
  const supabase = requireClient();
  const [trip, member] = await Promise.all([
    getActiveTrip(),
    getCurrentMember(),
  ]);
  if (!trip || !member || booking.cost == null) {
    throw new Error("missing expense context");
  }

  const currency = booking.currency ?? trip.base_currency;
  const rate = await getRateToIls(currency);
  if (rate == null) throw new Error("fx");

  const { error } = await supabase.from("expenses").insert({
    trip_id: trip.id,
    category_id: categoryId,
    amount: booking.cost,
    currency,
    amount_ils: Math.round(booking.cost * rate * 100) / 100,
    description: booking.title,
    spent_on: booking.start_date ?? todayISO(),
    booking_id: booking.id,
    created_by: member.id,
  });
  if (error) throw new Error(error.message);
}
