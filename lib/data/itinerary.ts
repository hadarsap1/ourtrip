import { getSupabase } from "@/lib/supabase";
import type { TablesInsert, TablesUpdate } from "@/lib/database.types";
import type { ItineraryDay, ItineraryItem } from "@/lib/types";
import type { ParsedItineraryRow } from "@/lib/importItinerary";

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

/**
 * How many day ids may go into one `in(...)` filter.
 *
 * PostgREST reads these as a GET, so every id is ~36 characters of query
 * string. This trip is 227 days long: asked in one request that is ~8.5 KB of
 * URL, past the 8 KB request line most gateways accept, and the failure is
 * silent - the query comes back empty and the screen renders as though the
 * trip had no plans at all. 100 keeps any single request well under it however
 * long the trip grows.
 */
const DAY_IDS_PER_REQUEST = 100;

export function chunkDayIds(dayIds: string[]): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < dayIds.length; i += DAY_IDS_PER_REQUEST) {
    chunks.push(dayIds.slice(i, i + DAY_IDS_PER_REQUEST));
  }
  return chunks;
}

/**
 * Which of these days carry at least one item. Used by the screens that only
 * need "is this day planned", not the items themselves.
 */
export async function listDayIdsWithItems(
  dayIds: string[]
): Promise<Set<string>> {
  const found = new Set<string>();
  for (const batch of chunkDayIds(dayIds)) {
    const { data, error } = await requireClient()
      .from("itinerary_items")
      .select("day_id")
      .in("day_id", batch);
    if (error) throw new Error(error.message);
    for (const row of data) found.add(row.day_id);
  }
  return found;
}

// ---------- days ----------

export async function listDays(tripId: string): Promise<ItineraryDay[]> {
  const { data, error } = await requireClient()
    .from("itinerary_days")
    .select("*")
    .eq("trip_id", tripId)
    .order("date");
  if (error) throw new Error(error.message);
  return data;
}

export async function createDay(
  day: TablesInsert<"itinerary_days">
): Promise<void> {
  const { error } = await requireClient().from("itinerary_days").insert(day);
  if (error) throw new Error(error.code === "23505" ? "duplicate_date" : error.message);
  autofillEmergencyFor(day.trip_id, day.country_code ?? null);
}

/** Adding a country to the route auto-generates its emergency page (SPEC 2.12).
 *  Fire-and-forget so it never blocks or fails the itinerary edit. */
function autofillEmergencyFor(tripId: string, countryCode: string | null): void {
  if (!countryCode) return;
  void import("@/lib/data/emergency")
    .then((m) => m.ensureEmergencyForCountry(tripId, countryCode))
    .catch(() => {});
}

export async function updateDay(
  id: string,
  patch: TablesUpdate<"itinerary_days">
): Promise<void> {
  const { error } = await requireClient()
    .from("itinerary_days")
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(error.code === "23505" ? "duplicate_date" : error.message);
  if (patch.country_code) {
    const code = patch.country_code;
    void import("@/lib/data/trip").then((m) =>
      m.getActiveTrip().then((t) => {
        if (t) autofillEmergencyFor(t.id, code);
      })
    );
  }
}

/** Deletes a day together with its items (FK restricts otherwise). */
export async function deleteDay(id: string): Promise<void> {
  const supabase = requireClient();
  const { error: itemsError } = await supabase
    .from("itinerary_items")
    .delete()
    .eq("day_id", id);
  if (itemsError) throw new Error(itemsError.message);
  const { error } = await supabase.from("itinerary_days").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Imports parsed spreadsheet rows: reuses a day per date (creating missing
 *  ones), then appends each titled row as an activity on its day. Everything
 *  stays fully editable afterwards. Returns how much was added. */
export async function importItinerary(
  tripId: string,
  rows: ParsedItineraryRow[]
): Promise<{
  daysCreated: number;
  itemsCreated: number;
  hotelsCreated: number;
  duplicatesSkipped: number;
}> {
  const supabase = requireClient();
  // strips a leading category emoji (e.g. "🏨 ") from a title
  const stripEmoji = (t: string) =>
    t.replace(/^\s*[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]️?\s*/u, "").trim();
  // de-dup key: same wording regardless of emoji/spacing/case
  const norm = (t: string) => stripEmoji(t).toLowerCase().replace(/\s+/g, " ").trim();

  // existing days by date, so an import merges into the current route
  const existing = await listDays(tripId);
  const dayByDate = new Map<string, ItineraryDay>(existing.map((d) => [d.date, d]));
  // next sort_order per day (append after whatever's already there) + the
  // titles already on each day, so a re-import doesn't duplicate them
  const nextOrder = new Map<string, number>();
  const titlesByDay = new Map<string, Set<string>>();
  if (existing.length > 0) {
    const items = await listItems(existing.map((d) => d.id));
    for (const d of existing) {
      const own = items.filter((i) => i.day_id === d.id);
      const max = own.reduce((m, i) => Math.max(m, i.sort_order), -1);
      nextOrder.set(d.id, max + 1);
      titlesByDay.set(d.id, new Set(own.map((i) => norm(i.title))));
    }
  }

  // existing hotel bookings keyed by title + check-in, for the same reason
  const { data: existingBookings } = await supabase
    .from("bookings")
    .select("title,start_date,type")
    .eq("trip_id", tripId);
  const hotelKeys = new Set(
    (existingBookings ?? [])
      .filter((b) => b.type === "hotel")
      .map((b) => `${norm(b.title)}|${b.start_date ?? ""}`)
  );

  let daysCreated = 0;
  let itemsCreated = 0;
  let hotelsCreated = 0;
  let duplicatesSkipped = 0;
  const orderedDates = [...new Set(rows.map((r) => r.date))].sort();

  for (const date of orderedDates) {
    const dayRows = rows.filter((r) => r.date === date);
    let day = dayByDate.get(date);
    if (!day) {
      // seed day-level fields from the first row that carries them (leg name +
      // country from the sheet; the date-range text becomes the day note)
      const seedCountry = dayRows.find((r) => r.country_code)?.country_code ?? null;
      const seedLocation =
        dayRows.find((r) => r.day_location)?.day_location ??
        dayRows.find((r) => r.location_name)?.location_name ??
        null;
      const seedNote = dayRows.find((r) => r.day_note)?.day_note ?? null;
      const { data, error } = await supabase
        .from("itinerary_days")
        .insert({
          trip_id: tripId,
          date,
          country_code: seedCountry,
          location_name: seedLocation,
          notes: seedNote,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      day = data;
      dayByDate.set(date, day);
      nextOrder.set(day.id, 0);
      titlesByDay.set(day.id, new Set());
      daysCreated++;
      autofillEmergencyFor(tripId, seedCountry);
    }

    const seenTitles = titlesByDay.get(day.id) ?? new Set<string>();

    for (const r of dayRows) {
      // לינה rows become hotel bookings (trip-scoped) instead of day activities
      if (r.is_lodging) {
        const hotelTitle = stripEmoji(r.title) || r.day_location || "מלון";
        const key = `${norm(hotelTitle)}|${r.date}`;
        if (hotelKeys.has(key)) {
          duplicatesSkipped++;
          continue;
        }
        const { error } = await supabase.from("bookings").insert({
          trip_id: tripId,
          type: "hotel",
          title: hotelTitle,
          start_date: r.date,
          end_date: r.day_end,
          link_url: r.link,
          notes: r.notes,
          status: "booked",
        });
        if (error) throw new Error(error.message);
        hotelKeys.add(key);
        hotelsCreated++;
        continue;
      }
      if (!r.title) continue; // day-header row, no activity
      const titleKey = norm(r.title);
      if (seenTitles.has(titleKey)) {
        duplicatesSkipped++;
        continue;
      }
      const order = nextOrder.get(day.id) ?? 0;
      const { error } = await supabase.from("itinerary_items").insert({
        day_id: day.id,
        title: r.title,
        start_time: r.start_time,
        end_time: r.end_time,
        location_name: r.location_name,
        notes: r.notes,
        sort_order: order,
      });
      if (error) throw new Error(error.message);
      seenTitles.add(titleKey);
      nextOrder.set(day.id, order + 1);
      itemsCreated++;
    }
  }

  return { daysCreated, itemsCreated, hotelsCreated, duplicatesSkipped };
}

// ---------- items ----------

export async function listItems(dayIds: string[]): Promise<ItineraryItem[]> {
  if (dayIds.length === 0) return [];
  // Chunked (see DAY_IDS_PER_REQUEST): the itinerary and map screens both ask
  // for every day of the trip at once.
  const batches = await Promise.all(
    chunkDayIds(dayIds).map(async (batch) => {
      const { data, error } = await requireClient()
        .from("itinerary_items")
        .select("*")
        .in("day_id", batch)
        .order("sort_order")
        .order("start_time", { ascending: true, nullsFirst: false });
      if (error) throw new Error(error.message);
      return data;
    })
  );
  // Each batch comes back ordered, but the concatenation of several is not, so
  // re-apply the same order here - callers rely on it to render a day's items.
  return batches.flat().sort(compareItems);
}

/** The server-side ordering of listItems: sort_order, then start_time, nulls
 *  last. Kept in one place so the chunked merge cannot drift from it. */
function compareItems(a: ItineraryItem, b: ItineraryItem): number {
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  if (a.start_time === b.start_time) return 0;
  if (a.start_time === null) return 1;
  if (b.start_time === null) return -1;
  return a.start_time < b.start_time ? -1 : 1;
}

/** Returns the new item's id. Callers that only wanted the side effect can
 *  ignore it; the options bank needs it to record what an option became. */
export async function createItem(
  item: TablesInsert<"itinerary_items">
): Promise<string> {
  const { data, error } = await requireClient()
    .from("itinerary_items")
    .insert(item)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function updateItem(
  id: string,
  patch: TablesUpdate<"itinerary_items">
): Promise<void> {
  const { error } = await requireClient()
    .from("itinerary_items")
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteItem(id: string): Promise<void> {
  const { error } = await requireClient()
    .from("itinerary_items")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Persists a new in-day order after a drag. `ordered` is the day's items in
 * their new order, each still carrying the sort_order it had before.
 *
 * Only the rows that actually moved are written. Dragging one item used to
 * issue an UPDATE per item in the day, and since every update echoes back
 * through the realtime channel, each one triggered another full refetch of
 * every day, item and booking - which is what made dragging feel like the app
 * had locked up.
 */
export async function reorderItems(
  ordered: Pick<ItineraryItem, "id" | "sort_order">[]
): Promise<void> {
  const moved = ordered
    .map((item, i) => ({ id: item.id, sort_order: i, was: item.sort_order }))
    .filter((item) => item.was !== item.sort_order);
  if (moved.length === 0) return;

  const supabase = requireClient();
  const results = await Promise.all(
    moved.map(({ id, sort_order }) =>
      supabase.from("itinerary_items").update({ sort_order }).eq("id", id)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
}

/** Moves an item to the end of another day. */
export async function moveItemToDay(
  itemId: string,
  dayId: string,
  sortOrder: number
): Promise<void> {
  const { error } = await requireClient()
    .from("itinerary_items")
    .update({ day_id: dayId, sort_order: sortOrder })
    .eq("id", itemId);
  if (error) throw new Error(error.message);
}

// ---------- realtime ----------

/** Refires onChange for any change to days or items. Returns unsubscribe. */
export function subscribeItinerary(onChange: () => void): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};
  const channel = supabase
    .channel("itinerary-sync")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "itinerary_days" },
      onChange
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "itinerary_items" },
      onChange
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
