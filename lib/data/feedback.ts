// Likes and comments on stories and episodes, and the bridge that carries a
// guest's comment to the kids (migration 00045).
//
// Kids have no policy on `comments` at all; listComments is simply never
// called for them, and if it were, RLS would return nothing.

import { getSupabase } from "@/lib/supabase";
import { realtimeTopic } from "@/lib/realtimeTopic";
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

export function subscribeFeedback(onChange: () => void): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};
  const channel = supabase
    .channel(realtimeTopic("feedback-sync"))
    .on("postgres_changes", { event: "*", schema: "public", table: "reactions" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, onChange)
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
