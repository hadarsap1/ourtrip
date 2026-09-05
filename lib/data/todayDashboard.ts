import { getSupabase } from "@/lib/supabase";
import { listCategories, listExpenses } from "@/lib/data/expenses";
import { getActiveTrip } from "@/lib/data/trip";
import { resolveBudgetTotals } from "@/lib/budget";
import { todayISO } from "@/lib/format";
import { tripPosition, type TripPosition } from "@/lib/tripDay";
import type { PhotoWithUrl } from "@/lib/data/photos";

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

const PHOTO_BUCKET = "photos";

/**
 * The numbers the redesigned Today screen puts in its tiles. Deliberately
 * separate from `loadToday`: that one is offline-critical and snapshot-backed
 * (today's itinerary must render with the network off), while these are an
 * enhancement. On any failure this returns null and the tiles that depend on it
 * simply don't render - the itinerary above them is unaffected.
 */
export async function loadTodayDashboard(): Promise<TodayDashboard | null> {
  try {
    const supabase = getSupabase();
    const trip = await getActiveTrip();
    if (!supabase || !trip) return null;

    const date = todayISO();
    const [categories, expenses, photos] = await Promise.all([
      listCategories(trip.id).catch(() => []),
      listExpenses(trip.id).catch(() => []),
      listPhotosForDate(trip.id, date).catch(() => []),
    ]);

    const spentTotal = expenses.reduce((sum, e) => sum + e.amount_ils, 0);
    const spentToday = expenses
      .filter((e) => e.spent_on === date)
      .reduce((sum, e) => sum + e.amount_ils, 0);

    return {
      position: tripPosition(trip.start_date, trip.end_date, date),
      spentToday,
      spentTotal,
      budget: resolveBudgetTotals(trip.total_budget, categories)
        .budgetForProgress,
      photos,
    };
  } catch {
    return null;
  }
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
    .order("created_at", { ascending: false });
  if (error || !data || data.length === 0) return [];

  const { data: signed } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(
      data.map((p) => p.file_path),
      60 * 60
    );
  const urlByPath = new Map(
    (signed ?? []).map((s) => [s.path, s.signedUrl ?? null])
  );
  return data.map((p) => ({ ...p, url: urlByPath.get(p.file_path) ?? null }));
}
