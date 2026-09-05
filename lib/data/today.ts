import { getSupabase } from "@/lib/supabase";
import { getActiveTrip } from "@/lib/data/trip";
import { listItems } from "@/lib/data/itinerary";
import { todayISO } from "@/lib/format";
import { readTodaySnapshot, saveTodaySnapshot } from "@/lib/offline/caches";
import type { Booking, ItineraryDay, ItineraryItem } from "@/lib/types";

export type TodayData = {
  date: string;
  day: ItineraryDay | null;
  items: ItineraryItem[];
  bookings: Booking[];
};

/**
 * Today's view data. Online: fetches and refreshes the offline snapshot
 * (acceptance: today's itinerary renders with network disabled).
 * Offline/failure: served from the snapshot, which carries its own date.
 */
export async function loadToday(): Promise<{
  data: TodayData;
  fromCache: boolean;
} | null> {
  const date = todayISO();
  try {
    const supabase = getSupabase();
    const trip = await getActiveTrip();
    if (!supabase || !trip) throw new Error("unavailable");

    const { data: day, error: dayError } = await supabase
      .from("itinerary_days")
      .select("*")
      .eq("trip_id", trip.id)
      .eq("date", date)
      .maybeSingle();
    if (dayError) throw new Error(dayError.message);

    const items = day ? await listItems([day.id]) : [];

    // bookings relevant today: ranges covering today + single-day bookings
    const { data: ranged, error: bookingsError } = await supabase
      .from("bookings")
      .select("*")
      .eq("trip_id", trip.id)
      .lte("start_date", date)
      .gte("end_date", date)
      .neq("status", "cancelled");
    if (bookingsError) throw new Error(bookingsError.message);
    const { data: single } = await supabase
      .from("bookings")
      .select("*")
      .eq("trip_id", trip.id)
      .eq("start_date", date)
      .is("end_date", null)
      .neq("status", "cancelled");

    const bookings = [...(ranged ?? []), ...(single ?? [])];
    const data: TodayData = { date, day: day ?? null, items, bookings };
    await saveTodaySnapshot(data);
    return { data, fromCache: false };
  } catch {
    const snapshot = await readTodaySnapshot();
    if (!snapshot) return null;
    return {
      data: {
        date: snapshot.date,
        day: snapshot.day,
        items: snapshot.items,
        bookings: snapshot.bookings,
      },
      fromCache: true,
    };
  }
}

/**
 * The country we're in today, as a 2-letter code. Falls back to the offline
 * snapshot, then to the most recent past day with a country set - so it still
 * answers on a travel day that has no itinerary row of its own.
 *
 * Multi-country by construction (CLAUDE.md rule #9): it reads the itinerary,
 * never a configured destination.
 */
export async function getTodayCountryCode(
  tripId: string
): Promise<string | null> {
  const date = todayISO();
  try {
    const supabase = getSupabase();
    if (!supabase) throw new Error("unavailable");
    const { data } = await supabase
      .from("itinerary_days")
      .select("country_code")
      .eq("trip_id", tripId)
      .lte("date", date)
      .not("country_code", "is", null)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.country_code) return data.country_code;
  } catch {
    // offline - fall through to the snapshot
  }
  const snapshot = await readTodaySnapshot();
  return snapshot?.day?.country_code ?? null;
}
