import { getSupabase } from "@/lib/supabase";
import type { TablesInsert, TablesUpdate } from "@/lib/database.types";
import type { ItineraryDay, ItineraryItem } from "@/lib/types";
import type { ParsedItineraryRow } from "@/lib/importItinerary";

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
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
): Promise<{ daysCreated: number; itemsCreated: number }> {
  const supabase = requireClient();

  // existing days by date, so an import merges into the current route
  const existing = await listDays(tripId);
  const dayByDate = new Map<string, ItineraryDay>(existing.map((d) => [d.date, d]));
  // next sort_order per day (append after whatever's already there)
  const nextOrder = new Map<string, number>();
  if (existing.length > 0) {
    const items = await listItems(existing.map((d) => d.id));
    for (const d of existing) {
      const max = items
        .filter((i) => i.day_id === d.id)
        .reduce((m, i) => Math.max(m, i.sort_order), -1);
      nextOrder.set(d.id, max + 1);
    }
  }

  let daysCreated = 0;
  let itemsCreated = 0;
  const orderedDates = [...new Set(rows.map((r) => r.date))].sort();

  for (const date of orderedDates) {
    const dayRows = rows.filter((r) => r.date === date);
    let day = dayByDate.get(date);
    if (!day) {
      // seed day-level fields from the first row that carries them
      const seedCountry = dayRows.find((r) => r.country_code)?.country_code ?? null;
      const seedLocation = dayRows.find((r) => r.location_name)?.location_name ?? null;
      const { data, error } = await supabase
        .from("itinerary_days")
        .insert({
          trip_id: tripId,
          date,
          country_code: seedCountry,
          location_name: seedLocation,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      day = data;
      dayByDate.set(date, day);
      nextOrder.set(day.id, 0);
      daysCreated++;
      autofillEmergencyFor(tripId, seedCountry);
    }

    for (const r of dayRows) {
      if (!r.title) continue; // day-header row, no activity
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
      nextOrder.set(day.id, order + 1);
      itemsCreated++;
    }
  }

  return { daysCreated, itemsCreated };
}

// ---------- items ----------

export async function listItems(dayIds: string[]): Promise<ItineraryItem[]> {
  if (dayIds.length === 0) return [];
  const { data, error } = await requireClient()
    .from("itinerary_items")
    .select("*")
    .in("day_id", dayIds)
    .order("sort_order")
    .order("start_time", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function createItem(
  item: TablesInsert<"itinerary_items">
): Promise<void> {
  const { error } = await requireClient().from("itinerary_items").insert(item);
  if (error) throw new Error(error.message);
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

/** Persists a new in-day order after a drag (index = sort_order). */
export async function reorderItems(orderedIds: string[]): Promise<void> {
  const supabase = requireClient();
  const results = await Promise.all(
    orderedIds.map((id, i) =>
      supabase.from("itinerary_items").update({ sort_order: i }).eq("id", id)
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
