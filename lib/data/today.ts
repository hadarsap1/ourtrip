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
