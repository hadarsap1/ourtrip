// "הישר לצנצנת" - what the kids said on the trip (00091).
//
// Parents write; kids read; a guest reads a quote only once a parent switched
// shared_with_guests on for it. All of that is RLS - this file just asks.

import { realtimeTopic } from "@/lib/realtimeTopic";
import { getSupabase } from "@/lib/supabase";
import type { JarQuote } from "@/lib/types";

function requireClient() {
  const client = getSupabase();
  if (!client) throw new Error("supabase_not_configured");
  return client;
}

export type JarDraft = {
  quote: string;
  meant: string;
  background: string;
  saidBy: string[];
  saidByOther: string[];
  saidOn: string;
};

/** Newest first: the date it was said, then when it was written down. */
export async function listQuotes(tripId: string): Promise<JarQuote[]> {
  const { data, error } = await requireClient()
    .from("jar_quotes")
    .select("*")
    .eq("trip_id", tripId)
    .order("said_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

/** The country of the itinerary day a quote was said on, if that day exists.
 *  Never a configured destination (CLAUDE.md #9). */
async function countryOn(tripId: string, date: string): Promise<string | null> {
  const { data } = await requireClient()
    .from("itinerary_days")
    .select("country_code")
    .eq("trip_id", tripId)
    .eq("date", date)
    .maybeSingle();
  return data?.country_code ?? null;
}

/** Empty strings become null and names are trimmed, so the row stays clean. */
export function normalizeDraft(draft: JarDraft) {
  const optional = (v: string) => (v.trim() === "" ? null : v.trim());
  return {
    quote: draft.quote.trim(),
    meant: optional(draft.meant),
    background: optional(draft.background),
    said_by: [...new Set(draft.saidBy)],
    said_by_other: [...new Set(draft.saidByOther.map((n) => n.trim()).filter((n) => n !== ""))],
    said_on: draft.saidOn,
  };
}

/** A quote needs words and at least one speaker. */
export function draftIsValid(draft: JarDraft): boolean {
  const row = normalizeDraft(draft);
  return row.quote !== "" && row.said_by.length + row.said_by_other.length > 0;
}

/** Whether the caller can see any quote at all - for a guest, whether a parent
 *  has shared one yet, so the guest home shows the door only then. */
export async function hasQuotes(tripId: string): Promise<boolean> {
  const { count, error } = await requireClient()
    .from("jar_quotes")
    .select("id", { count: "exact", head: true })
    .eq("trip_id", tripId);
  if (error) return false;
  return (count ?? 0) > 0;
}

export async function addQuote(tripId: string, draft: JarDraft, createdBy: string | null): Promise<void> {
  const row = normalizeDraft(draft);
  const { error } = await requireClient()
    .from("jar_quotes")
    .insert({
      ...row,
      trip_id: tripId,
      country_code: await countryOn(tripId, row.said_on).catch(() => null),
      created_by: createdBy,
    });
  if (error) throw new Error(error.message);
}

export async function updateQuote(tripId: string, id: string, draft: JarDraft): Promise<void> {
  const row = normalizeDraft(draft);
  const { error } = await requireClient()
    .from("jar_quotes")
    .update({ ...row, country_code: await countryOn(tripId, row.said_on).catch(() => null) })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setQuoteShared(id: string, shared: boolean): Promise<void> {
  const { error } = await requireClient()
    .from("jar_quotes")
    .update({ shared_with_guests: shared })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteQuote(id: string): Promise<void> {
  const { error } = await requireClient().from("jar_quotes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Live updates from the other parent's phone. Realtime delivers only the rows
 *  the caller's SELECT policy admits, so a guest hears only shared quotes. */
export function subscribeQuotes(onChange: () => void): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};
  const channel = supabase
    .channel(realtimeTopic("jar-quotes"))
    .on("postgres_changes", { event: "*", schema: "public", table: "jar_quotes" }, onChange)
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
