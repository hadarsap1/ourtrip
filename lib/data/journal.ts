import { getSupabase } from "@/lib/supabase";
import { todayISO } from "@/lib/format";
import { readTodaySnapshot } from "@/lib/offline/caches";
import type { Tables } from "@/lib/database.types";

export type JournalEntry = Tables<"journal_entries">;

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

/** RLS scopes the result: kids get their own entries, owners get all. */
export async function listJournal(tripId: string): Promise<JournalEntry[]> {
  const { data, error } = await requireClient()
    .from("journal_entries")
    .select("*")
    .eq("trip_id", tripId)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

/** Auto-tag location: today's itinerary day, falling back to the offline
 *  snapshot (Sprint 6 acceptance: entry auto-tags date + location). */
export async function getAutoLocation(tripId: string): Promise<string | null> {
  try {
    const { data } = await requireClient()
      .from("itinerary_days")
      .select("location_name")
      .eq("trip_id", tripId)
      .eq("date", todayISO())
      .maybeSingle();
    if (data?.location_name) return data.location_name;
  } catch {
    // offline - try the snapshot below
  }
  const snapshot = await readTodaySnapshot();
  return snapshot?.day?.location_name ?? null;
}

export async function createJournalEntry(input: {
  tripId: string;
  authorId: string;
  body: string;
  mood: string | null;
  locationName: string | null;
  /** Defaults to today; a replayed offline entry keeps the day it was written. */
  entryDate?: string;
}): Promise<JournalEntry> {
  const { data, error } = await requireClient()
    .from("journal_entries")
    .insert({
      trip_id: input.tripId,
      author_id: input.authorId,
      body: input.body.trim(),
      mood: input.mood,
      entry_date: input.entryDate ?? todayISO(),
      location_name: input.locationName,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Saves, or queues when the connection is down (F10 write queue). The entry
 * keeps the date it was written on. Returns the saved row, or "queued".
 */
export async function createJournalEntryOrQueue(
  input: Parameters<typeof createJournalEntry>[0]
): Promise<JournalEntry | "queued"> {
  const entryDate = input.entryDate ?? todayISO();
  try {
    return await createJournalEntry({ ...input, entryDate });
  } catch (e) {
    const { isConnectivityError } = await import("@/lib/data/expenses");
    if (!isConnectivityError(e)) throw e;
    const { enqueueJournal } = await import("@/lib/offline/queue");
    await enqueueJournal({
      tripId: input.tripId,
      authorId: input.authorId,
      body: input.body.trim(),
      mood: input.mood,
      locationName: input.locationName,
      entryDate,
    });
    return "queued";
  }
}

export async function deleteJournalEntry(id: string): Promise<void> {
  const { error } = await requireClient()
    .from("journal_entries")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Owner-only (RLS + journal guard block kids from flipping this). */
export async function setJournalShared(id: string, shared: boolean): Promise<void> {
  const { error } = await requireClient()
    .from("journal_entries")
    .update({ shared_with_guests: shared })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
