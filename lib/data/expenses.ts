import { getSupabase } from "@/lib/supabase";
import { todayISO } from "@/lib/format";
import { getActiveTrip, getCurrentMember } from "@/lib/data/trip";
import type { TablesInsert, TablesUpdate } from "@/lib/database.types";
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

// A rate for a given day never changes once resolved, but the lookup can cost
// a Supabase query plus two external HTTP calls. The converter card and every
// bulk expense line asked again each time; memoising per currency+day keeps a
// screenful of expenses to one lookup. Failures are not cached, so a rate
// missed while offline is retried on reconnect.
const rateCache = new Map<string, number>();
const rateInFlight = new Map<string, Promise<number | null>>();

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

  const key = `${currency}|${day}`;
  const hit = rateCache.get(key);
  if (hit !== undefined) return hit;

  let pending = rateInFlight.get(key);
  if (!pending) {
    pending = fetchRateToIls(currency, day)
      .then((rate) => {
        if (rate !== null) rateCache.set(key, rate);
        return rate;
      })
      .finally(() => {
        rateInFlight.delete(key);
      });
    rateInFlight.set(key, pending);
  }
  return pending;
}

async function fetchRateToIls(
  currency: string,
  day: string
): Promise<number | null> {
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

/** Overall trip budget. NULL clears it, which puts the screen back to
 *  deriving the total from the categories. */
export async function updateTripTotalBudget(
  tripId: string,
  totalBudget: number | null
): Promise<void> {
  const { error } = await requireClient()
    .from("trips")
    .update({ total_budget: totalBudget })
    .eq("id", tripId);
  if (error) throw new Error(error.message);
}

/** Categories used to come only from the seed file, so a category the seed did
 *  not think of could not be added at all. `key` is a stable slug used by the
 *  seed and by booking→expense mapping; custom ones get a generated key that
 *  cannot collide with a seeded one. */
export async function createCategory(
  tripId: string,
  labelHe: string,
  plannedAmount = 0
): Promise<void> {
  const { error } = await requireClient().from("budget_categories").insert({
    trip_id: tripId,
    key: `custom_${crypto.randomUUID().slice(0, 8)}`,
    label_he: labelHe.trim(),
    planned_amount: plannedAmount,
  });
  if (error) throw new Error(error.message);
}

export async function renameCategory(
  categoryId: string,
  labelHe: string
): Promise<void> {
  const { error } = await requireClient()
    .from("budget_categories")
    .update({ label_he: labelHe.trim() })
    .eq("id", categoryId);
  if (error) throw new Error(error.message);
}

/** Deleting a category that still has expenses is refused by the FK (23503).
 *  Surfaced as a named error so the UI can explain it rather than showing a
 *  Postgres code - losing the expenses silently would be far worse. */
export async function deleteCategory(categoryId: string): Promise<void> {
  const { error } = await requireClient()
    .from("budget_categories")
    .delete()
    .eq("id", categoryId);
  if (error) {
    throw new Error(error.code === "23503" ? "category_in_use" : error.message);
  }
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

/** Bulk quick-add: saves many free-text lines in one go, each converted at the
 *  spent_on day's rate. Lines whose currency has no rate are reported back
 *  rather than failing the whole batch. */
export async function createExpenses(
  lines: { amount: number; currency: string; description?: string | null }[],
  opts: { categoryId: string; spentOn?: string }
): Promise<{ saved: number; failed: { description: string; reason: "fx" }[] }> {
  const supabase = requireClient();
  const [trip, member] = await Promise.all([getActiveTrip(), getCurrentMember()]);
  if (!trip || !member) throw new Error("missing expense context");

  const spentOn = opts.spentOn ?? todayISO();

  // one rate lookup per distinct currency, not per line
  const currencies = [...new Set(lines.map((l) => l.currency))];
  const rates = new Map<string, number | null>();
  await Promise.all(
    currencies.map(async (c) => rates.set(c, await getRateToIls(c, spentOn)))
  );

  const rows: TablesInsert<"expenses">[] = [];
  const failed: { description: string; reason: "fx" }[] = [];
  for (const line of lines) {
    const rate = rates.get(line.currency) ?? null;
    if (rate == null) {
      failed.push({ description: line.description?.trim() || line.currency, reason: "fx" });
      continue;
    }
    rows.push({
      trip_id: trip.id,
      category_id: opts.categoryId,
      amount: line.amount,
      currency: line.currency,
      amount_ils: Math.round(line.amount * rate * 100) / 100,
      description: line.description?.trim() || null,
      spent_on: spentOn,
      created_by: member.id,
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("expenses").insert(rows);
    if (error) throw new Error(error.message);
  }
  return { saved: rows.length, failed };
}

export function isConnectivityError(e: unknown): boolean {
  // Only trust navigator.onLine when it's actually a boolean (it's undefined
  // in Node/SSR, where treating it as "offline" would misclassify errors).
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.onLine === "boolean" &&
    !navigator.onLine
  ) {
    return true;
  }
  const message = e instanceof Error ? e.message.toLowerCase() : "";
  return message.includes("fetch") || message.includes("network");
}

/**
 * Fast-entry path: tries to save, and when the failure looks like lost
 * connectivity (incl. "fx" - offline means no rate source is reachable)
 * queues the expense for replay on reconnect. Genuine online errors
 * (validation, RLS, FX provider outage) still throw.
 */
export async function createExpenseOrQueue(input: {
  categoryId: string;
  amount: number;
  currency: string;
  description?: string | null;
  spentOn?: string;
}): Promise<"saved" | "queued"> {
  try {
    await createExpense(input);
    return "saved";
  } catch (e) {
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    if (isConnectivityError(e) || (offline && e instanceof Error && e.message === "fx")) {
      const { enqueueExpense } = await import("@/lib/offline/queue");
      await enqueueExpense({
        categoryId: input.categoryId,
        amount: input.amount,
        currency: input.currency,
        description: input.description?.trim() || null,
        spentOn: input.spentOn ?? todayISO(),
      });
      return "queued";
    }
    throw e;
  }
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
