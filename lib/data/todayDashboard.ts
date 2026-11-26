import { getSupabase, onSignedOut } from "@/lib/supabase";
import { getTripTotalBudget, listCategories, listExpenseTotals, type ExpenseTotalRow } from "@/lib/data/expenses";
import { getActiveTrip } from "@/lib/data/trip";
import { countedExpenses, resolveBudgetTotals } from "@/lib/budget";
import { todayISO } from "@/lib/format";
import { tripPosition, type TripPosition } from "@/lib/tripDay";
import { signFamilyMedia, type PhotoWithUrl } from "@/lib/data/photos";
import { requestHome } from "@/lib/data/homeRpc";

export type TodayDashboard = {
  /** Where today falls in the trip, or null when the trip has no date range. */
  position: TripPosition | null;
  /** Today's spend in ILS. */
  spentToday: number;
  /** Trip-to-date spend in ILS. */
  spentTotal: number;
  /** What spending is measured against: the target, else the planned sum. */
  budget: number;
  /** Photos taken today, newest first. */
  photos: PhotoWithUrl[];
};


/**
 * The numbers the redesigned Today screen puts in its tiles. Deliberately
 * separate from `loadToday`: that one is offline-critical and snapshot-backed
 * (today's itinerary must render with the network off), while these are an
 * enhancement. On any failure this returns null and the tiles that depend on it
 * simply don't render - the itinerary above them is unaffected.
 */
// The last answer, so coming back to the home tab shows the tiles at once
// while a fresh answer is fetched (perf, 24/11/2026: every return to the home
// asked the whole set again and showed nothing until it came back).
let last: { date: string; value: TodayDashboard } | null = null;
// the budget is a parent's: never shown to the next account on this phone
onSignedOut(() => {
  last = null;
});

/** The tiles as last loaded today, for an instant first paint; null if none. */
export function peekTodayDashboard(): TodayDashboard | null {
  return last && last.date === todayISO() ? last.value : null;
}

export async function loadTodayDashboard(): Promise<TodayDashboard | null> {
  try {
    const date = todayISO();
    // one request for all of it (00107); the separate queries are the fallback
    const home = await requestHome();
    if (home) {
      const value = build(
        home.categories,
        home.expenses,
        home.totalBudget,
        await signFamilyMedia(home.photosToday).catch(() => [] as PhotoWithUrl[]),
        date,
        (await getActiveTrip()) ?? null
      );
      last = { date, value };
      return value;
    }

    const supabase = getSupabase();
    const trip = await getActiveTrip();
    if (!supabase || !trip) return null;

    const [categories, expenses, totalBudget, photos] = await Promise.all([
      listCategories(trip.id).catch(() => []),
      listExpenseTotals(trip.id).catch(() => []),
      getTripTotalBudget(trip.id).catch(() => null),
      listPhotosForDate(trip.id, date).catch(() => []),
    ]);
    const value = build(categories, expenses, totalBudget, photos, date, trip);
    last = { date, value };
    return value;
  } catch {
    return null;
  }
}

function build(
  categories: Parameters<typeof resolveBudgetTotals>[1],
  expenses: ExpenseTotalRow[],
  totalBudget: number | null,
  photos: PhotoWithUrl[],
  date: string,
  trip: { start_date: string | null; end_date: string | null } | null
): TodayDashboard {
  // a withdrawal counts only what the cash expenses left of it (00089)
  const counted = countedExpenses(expenses);
  const spentTotal = counted.reduce((sum, e) => sum + e.amount_ils, 0);
  const spentToday = counted.filter((e) => e.spent_on === date).reduce((sum, e) => sum + e.amount_ils, 0);
  return {
    position: trip ? tripPosition(trip.start_date, trip.end_date, date) : null,
    spentToday,
    spentTotal,
    budget: resolveBudgetTotals(totalBudget, categories).budgetForProgress,
    photos,
  };
}

/**
 * Photos from one day, with signed URLs. RLS scopes the rows by role, and the
 * guest-visible policy still requires approved + shared_with_guests - this adds
 * no visibility of its own.
 */
export async function listPhotosForDate(
  tripId: string,
  date: string
): Promise<PhotoWithUrl[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("photos")
    .select("*")
    .eq("trip_id", tripId)
    .eq("taken_on", date)
    // album photos stay in their album (00087)
    .is("album_id", null)
    .order("created_at", { ascending: false });
  if (error || !data || data.length === 0) return [];
  return signFamilyMedia(data);
}
