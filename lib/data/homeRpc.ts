// The parents' home in one request (00107). After the opening request
// (lib/boot.ts) the home still asked about ten questions of its own - budget
// categories, the trip total, every expense, today's photos, the parents and
// their steps (one after the other) - each paying the trip to the database's
// region (~200-800 ms from Vietnam, edge logs 24/11/2026). home_dashboard
// answers them together, as the caller (same RLS as the separate queries).
//
// Like app_boot, everything keeps its own queries as the fallback: a database
// without the function, a failed call, or an answer past its freshness all
// mean "ask the way you always did". One answer serves every loader that asks
// within a few seconds (the dashboard tiles and the steps card mount together).

import { getSupabase, onSignedOut } from "@/lib/supabase";
import { todayISO } from "@/lib/format";
import type { BudgetCategory, Expense } from "@/lib/types";
import type { Photo } from "@/lib/data/photos";
import type { StepRow } from "@/lib/stepsView";

export type HomeExpense = Pick<
  Expense,
  "id" | "amount" | "currency" | "amount_ils" | "spent_on" | "is_cash_withdrawal" | "paid_in_cash"
>;

export type HomeRpc = {
  tripId: string;
  categories: BudgetCategory[];
  totalBudget: number | null;
  expenses: HomeExpense[];
  photosToday: Photo[];
  parents: { id: string; name: string }[];
  /** steps rows start here: the week, or the current country stay if longer */
  stepsFrom: string;
  steps: StepRow[];
};

/** One answer serves the loaders this long, like app_boot's. */
export const HOME_FRESH_MS = 8_000;
const DAY_MS = 86_400_000;

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/** Narrow what the function returned; null when there is no active trip. */
export function parseHome(raw: unknown): HomeRpc | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (typeof o.trip_id !== "string") return null;
  return {
    tripId: o.trip_id,
    categories: asArray<BudgetCategory>(o.categories),
    totalBudget: typeof o.total_budget === "number" ? o.total_budget : null,
    expenses: asArray<HomeExpense>(o.expenses),
    photosToday: asArray<Photo>(o.photos_today),
    parents: asArray<{ id: string; name: string }>(o.parents),
    stepsFrom: typeof o.steps_from === "string" ? o.steps_from : todayISO(),
    steps: asArray<StepRow>(o.steps),
  };
}

/** The week the steps card charts: today and the six days before. */
export function weekStart(today: string): string {
  return new Date(Date.parse(`${today}T00:00:00Z`) - 6 * DAY_MS).toISOString().slice(0, 10);
}

let current: { at: number; date: string; result: Promise<HomeRpc | null> } | null = null;
// a database without 00107: stop asking for this session
let unsupported = false;

// the next account on this phone asks for its own
onSignedOut(() => {
  current = null;
});

async function callHome(today: string): Promise<HomeRpc | null> {
  const supabase = getSupabase();
  if (!supabase || unsupported) return null;
  try {
    // the function's name is not in the generated types until they are regenerated
    const rpc = supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>
    ) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
    const { data, error } = await rpc.call(supabase, "home_dashboard", {
      p_today: today,
      p_steps_from: weekStart(today),
    });
    if (error) {
      // PGRST202: no such function in the schema cache; 42883: undefined function
      if (error.code === "PGRST202" || error.code === "42883") unsupported = true;
      return null;
    }
    return parseHome(data);
  } catch {
    return null;
  }
}

/** The home's answer: the one in the air or just answered, else a new one.
 *  null = ask the separate queries (no function, failed, or no trip). */
export function requestHome(now: number = Date.now()): Promise<HomeRpc | null> {
  const today = todayISO();
  if (current && current.date === today && now - current.at < HOME_FRESH_MS) return current.result;
  const entry = { at: now, date: today, result: callHome(today) };
  current = entry;
  return entry.result;
}

/** Test hook, and for a sign-out or a write the home should see at once. */
export function invalidateHome(): void {
  current = null;
}
