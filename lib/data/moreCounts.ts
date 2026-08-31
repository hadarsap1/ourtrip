import { getSupabase } from "@/lib/supabase";
import { getActiveTrip } from "@/lib/data/trip";
import { getTodayCountryCode } from "@/lib/data/today";

export type MoreCounts = {
  recommendations: number;
  mapPins: number;
  phrases: number;
  options: number;
  journal: number;
  photos: number;
  messages: number;
  /** Checklist items ticked / total, across every list. */
  checklistDone: number;
  checklistTotal: number;
  kidDevices: number;
  guests: number;
  /** Today's emergency country, so the row can say where you'd land. */
  countryCode: string | null;
};

const EMPTY: MoreCounts = {
  recommendations: 0,
  mapPins: 0,
  phrases: 0,
  options: 0,
  journal: 0,
  photos: 0,
  messages: 0,
  checklistDone: 0,
  checklistTotal: 0,
  kidDevices: 0,
  guests: 0,
  countryCode: null,
};

/**
 * Counts for the "עוד" screen. Every row carries a number, so you can tell
 * whether there is anything behind it without tapping — which is the whole
 * point of a menu screen.
 *
 * These are `head: true` count queries: Postgres returns the count and no rows,
 * so the whole screen costs one round trip's worth of small queries and no
 * payload. RLS still applies to each, so the numbers are what this role can
 * actually see. Any individual failure degrades to 0 rather than taking the
 * screen down.
 */
export async function loadMoreCounts(): Promise<MoreCounts> {
  const supabase = getSupabase();
  const trip = await getActiveTrip();
  if (!supabase || !trip) return EMPTY;

  // One helper per shape rather than a generic one: Supabase's generated types
  // resolve the row type from the literal table name, and a variable there
  // collapses them all to `never`.
  const simpleCount = async (
    query: PromiseLike<{ count: number | null }>
  ): Promise<number> => {
    try {
      const { count } = await query;
      return count ?? 0;
    } catch {
      return 0;
    }
  };

  const [
    recommendations,
    mapPins,
    phrases,
    options,
    journal,
    photos,
    messages,
    checklistTotal,
    checklistDone,
    kidDevices,
    guests,
    countryCode,
  ] = await Promise.all([
    simpleCount(
      supabase
        .from("saved_recommendations")
        .select("*", { count: "exact", head: true })
        .eq("trip_id", trip.id)
    ),
    simpleCount(
      supabase
        .from("map_pins")
        .select("*", { count: "exact", head: true })
        .eq("trip_id", trip.id)
    ),
    simpleCount(
      supabase
        .from("phrasebook_entries")
        .select("*", { count: "exact", head: true })
        .eq("trip_id", trip.id)
    ),
    simpleCount(
      supabase
        .from("place_options")
        .select("*", { count: "exact", head: true })
        .eq("trip_id", trip.id)
    ),
    simpleCount(
      supabase
        .from("journal_entries")
        .select("*", { count: "exact", head: true })
        .eq("trip_id", trip.id)
    ),
    simpleCount(
      supabase
        .from("photos")
        .select("*", { count: "exact", head: true })
        .eq("trip_id", trip.id)
    ),
    simpleCount(
      supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("trip_id", trip.id)
    ),
    countChecklistItems(supabase, trip.id, null),
    countChecklistItems(supabase, trip.id, true),
    countKidDevices(supabase, trip.id),
    countGuests(supabase, trip.id),
    getTodayCountryCode(trip.id).catch(() => null),
  ]);

  return {
    recommendations,
    mapPins,
    phrases,
    options,
    journal,
    photos,
    messages,
    checklistDone,
    checklistTotal,
    kidDevices,
    guests,
    countryCode,
  };
}

type Client = NonNullable<ReturnType<typeof getSupabase>>;

/** checklist_items has no trip_id — it hangs off checklists, which does. */
async function countChecklistItems(
  supabase: Client,
  tripId: string,
  checked: boolean | null
): Promise<number> {
  try {
    const { data: lists } = await supabase
      .from("checklists")
      .select("id")
      .eq("trip_id", tripId);
    const ids = (lists ?? []).map((l) => l.id);
    if (ids.length === 0) return 0;
    let query = supabase
      .from("checklist_items")
      .select("*", { count: "exact", head: true })
      .in("checklist_id", ids);
    if (checked !== null) query = query.eq("checked", checked);
    const { count } = await query;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Live kid tablets: registered and not revoked. */
async function countKidDevices(
  supabase: Client,
  tripId: string
): Promise<number> {
  try {
    const { data: kids } = await supabase
      .from("members")
      .select("id")
      .eq("trip_id", tripId)
      .eq("role", "kid");
    const ids = (kids ?? []).map((k) => k.id);
    if (ids.length === 0) return 0;
    const { count } = await supabase
      .from("kid_devices")
      .select("*", { count: "exact", head: true })
      .in("member_id", ids)
      .is("revoked_at", null);
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Guests still invited — a revoked invitation isn't a guest. */
async function countGuests(supabase: Client, tripId: string): Promise<number> {
  try {
    const { count } = await supabase
      .from("guests_allowlist")
      .select("*", { count: "exact", head: true })
      .eq("trip_id", tripId)
      .is("revoked_at", null);
    return count ?? 0;
  } catch {
    return 0;
  }
}
