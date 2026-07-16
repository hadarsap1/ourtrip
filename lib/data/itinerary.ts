import { getSupabase } from "@/lib/supabase";
import type { TablesInsert, TablesUpdate } from "@/lib/database.types";
import type { ItineraryDay, ItineraryItem } from "@/lib/types";

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
