import { getSupabase } from "@/lib/supabase";
import { todayISO } from "@/lib/format";
import { readTodaySnapshot } from "@/lib/offline/caches";
import type { Post } from "@/lib/types";

// Since 00078 the journal and the stories are one table, `posts`: a journal
// entry is a family post. This file keeps the quick paths that write one -
// the composer's offline fallback, the capture button, the offline queue -
// and the place auto-tag; the feed itself lives in lib/data/stories.ts.

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
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

/** A family entry for the day it was written (posts_guard: no gate for the
 *  family, for a kid too). */
export async function createJournalEntry(input: {
  tripId: string;
  authorId: string;
  body: string;
  mood: string | null;
  locationName: string | null;
  /** Defaults to today; a replayed offline entry keeps the day it was written. */
  entryDate?: string;
}): Promise<Post> {
  const { data, error } = await requireClient()
    .from("posts")
    .insert({
      trip_id: input.tripId,
      author_id: input.authorId,
      body: input.body.trim(),
      mood: input.mood,
      entry_date: input.entryDate ?? todayISO(),
      place_label: input.locationName?.slice(0, 80) || null,
      status: "approved",
      visibility: "family",
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
): Promise<Post | "queued"> {
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
