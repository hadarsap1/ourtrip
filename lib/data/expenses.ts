import { getSupabase } from "@/lib/supabase";
import { todayISO } from "@/lib/format";
import { getActiveTrip, getCurrentMember } from "@/lib/data/trip";
import type { Booking, BudgetCategory } from "@/lib/types";

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
 * On-demand ILS rate for a linked expense. The scheduled daily FX fetch into
 * fx_rates is Sprint 3; until then: open.er-api.com → Frankfurter → last
 * known rate in fx_rates (DECISIONS #7 provider order).
 */
export async function getRateToIls(currency: string): Promise<number | null> {
  if (currency === "ILS") return 1;

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
