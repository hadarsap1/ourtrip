// Likes and comments on stories and episodes, and the bridge that carries a
// guest's comment to the kids (migration 00045).
//
// Kids have no policy on `comments` at all; listComments is simply never
// called for them, and if it were, RLS would return nothing.

import { getSupabase } from "@/lib/supabase";
import { realtimeTopic, spreadDelay } from "@/lib/realtimeTopic";
import type { Comment, Reaction, ReactionKind } from "@/lib/types";

import type { FeedbackTarget } from "@/lib/feedback";

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

function targetColumns(target: FeedbackTarget) {
  return "postId" in target
    ? { post_id: target.postId, episode_id: null }
    : { post_id: null, episode_id: target.episodeId };
}

/** Every like this member may see on the trip, in one query (RLS filters). */
export async function listReactions(tripId: string): Promise<Reaction[]> {
  const { data, error } = await requireClient()
    .from("reactions")
    .select("*")
    .eq("trip_id", tripId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return data;
}

export async function addReaction(
  tripId: string,
  memberId: string,
  target: FeedbackTarget,
  kind: ReactionKind
): Promise<void> {
  const { error } = await requireClient()
    .from("reactions")
    .insert({ trip_id: tripId, member_id: memberId, kind, ...targetColumns(target) });
  // a double tap racing itself is not an error worth showing
  if (error && error.code !== "23505") throw new Error(error.message);
}

export async function removeReaction(id: string): Promise<void> {
  const { error } = await requireClient().from("reactions").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listComments(tripId: string): Promise<Comment[]> {
  const { data, error } = await requireClient()
    .from("comments")
    .select("*")
    .eq("trip_id", tripId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return data;
}

export async function addComment(
  tripId: string,
  authorId: string,
  target: FeedbackTarget,
  body: string
): Promise<void> {
  const { error } = await requireClient()
    .from("comments")
    .insert({ trip_id: tripId, author_id: authorId, body: body.trim(), ...targetColumns(target) });
  if (error) throw new Error(error.message);
}

export async function deleteComment(id: string): Promise<void> {
  const { error } = await requireClient().from("comments").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** One like/comment change as realtime delivers it - already filtered by the reader's RLS. */
export type FeedbackChange = {
  table: "reactions" | "comments";
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: { id?: string; created_at?: string };
  old: { id?: string };
};

/** Whether a change carries enough to apply without a refetch. */
export function canApplyFeedbackChange(change: FeedbackChange): boolean {
  if (change.eventType === "DELETE") return Boolean(change.old.id);
  return Boolean(change.new.id && change.new.created_at);
}

/**
 * Applies a realtime change to a likes or comments list on screen. With a
 * crowd liking at once, reloading every like and comment of the trip per
 * change was the heaviest read in the load test. Check canApplyFeedbackChange
 * first.
 */
export function applyFeedbackChange<T extends { id: string; created_at: string }>(
  list: T[],
  change: FeedbackChange
): T[] {
  if (!canApplyFeedbackChange(change)) return list;
  if (change.eventType === "DELETE") return list.filter((x) => x.id !== change.old.id);
  const row = change.new as T;
  const rest = list.filter((x) => x.id !== row.id);
  rest.push(row);
  return rest.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/**
 * Hands each like/comment change on this trip to onChange. A change that
 * cannot be applied from its payload asks for a reload instead, debounced and
 * spread out so a crowd of readers does not reload at the same instant.
 * DELETE cannot be filtered server-side (its payload is the id alone), so it
 * stays unfiltered.
 */
export function subscribeFeedback(
  tripId: string,
  handlers: { apply: (change: FeedbackChange) => void; reload: () => void }
): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  const deliver = (table: FeedbackChange["table"]) => (payload: unknown) => {
    const change = { ...(payload as Omit<FeedbackChange, "table">), table };
    if (canApplyFeedbackChange(change)) {
      handlers.apply(change);
      return;
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      handlers.reload();
    }, spreadDelay(300));
  };
  const filter = `trip_id=eq.${tripId}`;
  let channel = supabase.channel(realtimeTopic("feedback-sync"));
  for (const table of ["reactions", "comments"] as const) {
    channel = channel
      .on("postgres_changes", { event: "INSERT", schema: "public", table, filter }, deliver(table))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table, filter }, deliver(table))
      .on("postgres_changes", { event: "DELETE", schema: "public", table }, deliver(table));
  }
  channel.subscribe();
  return () => {
    if (timer) clearTimeout(timer);
    void supabase.removeChannel(channel);
  };
}
