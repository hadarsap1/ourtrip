import { getSupabase } from "@/lib/supabase";
import { getActiveTrip } from "@/lib/data/trip";
import { listItems } from "@/lib/data/itinerary";
import { todayISO } from "@/lib/format";
import { readTodaySnapshot, saveTodaySnapshot } from "@/lib/offline/caches";
import { freshBoot } from "@/lib/boot";
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
// The last live answer, so coming back to the home tab paints at once while a
// fresh one is fetched (perf, 24/11/2026). Today's only, never across midnight.
let lastLive: TodayData | null = null;

/** Today's plan as last loaded live this session, or null. */
export function peekToday(): TodayData | null {
  return lastLive && lastLive.date === todayISO() ? lastLive : null;
}

export async function loadToday(): Promise<{
  data: TodayData;
  fromCache: boolean;
} | null> {
  const date = todayISO();
  try {
    const supabase = getSupabase();
    const trip = await getActiveTrip();
    if (!supabase || !trip) throw new Error("unavailable");

    // The opening request (00096) already holds today for this trip: the day,
    // its items (cancelled bookings' entries left out) and today's bookings,
    // read under the same policies as the queries below.
    const boot = await freshBoot();
    if (boot?.today && boot.today.date === date && boot.trip?.id === trip.id) {
      const data: TodayData = { date, day: boot.today.day, items: boot.today.items, bookings: boot.today.bookings };
      lastLive = data;
      await saveTodaySnapshot(data);
      return { data, fromCache: false };
    }

    // The day and today's bookings do not depend on each other: asked
    // together, the fallback costs the slowest round trip, not the sum
    // (perf review 24/11/2026). Items need the day's id, so they follow.
    const [dayRes, rangedRes, singleRes] = await Promise.all([
      supabase.from("itinerary_days").select("*").eq("trip_id", trip.id).eq("date", date).maybeSingle(),
      // bookings relevant today: ranges covering today + single-day bookings
      supabase
        .from("bookings")
        .select("*")
        .eq("trip_id", trip.id)
        .lte("start_date", date)
        .gte("end_date", date)
        .neq("status", "cancelled"),
      supabase
        .from("bookings")
        .select("*")
        .eq("trip_id", trip.id)
        .eq("start_date", date)
        .is("end_date", null)
        .neq("status", "cancelled"),
    ]);
    if (dayRes.error) throw new Error(dayRes.error.message);
    if (rangedRes.error) throw new Error(rangedRes.error.message);
    const day = dayRes.data;
    const ranged = rangedRes.data;
    const single = singleRes.data;

    const dayItems = day ? await listItems([day.id]) : [];
    // An entry made from a booking that was later cancelled is not today's
    // plan (31/10: a cancelled hotel sat in "today's plan" beside "tonight").
    // Cancelling now removes such entries (#165); this hides older leftovers.
    const linked = [...new Set(dayItems.map((i) => i.booking_id).filter((id): id is string => id !== null))];
    let cancelledIds = new Set<string>();
    if (linked.length > 0) {
      const { data: cancelled } = await supabase
        .from("bookings")
        .select("id")
        .in("id", linked)
        .eq("status", "cancelled");
      cancelledIds = new Set((cancelled ?? []).map((b) => b.id));
    }
    const items = dayItems.filter((i) => !i.booking_id || !cancelledIds.has(i.booking_id));

    const bookings = [...(ranged ?? []), ...(single ?? [])];
    const data: TodayData = { date, day: day ?? null, items, bookings };
    lastLive = data;
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
