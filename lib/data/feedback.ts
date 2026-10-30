// Likes and comments on stories and episodes, and the bridge that carries a
// guest's comment to the kids (migration 00045).
//
// Kids have no policy on `comments` at all; listComments is simply never
// called for them, and if it were, RLS would return nothing.

import { getSupabase } from "@/lib/supabase";
import { spreadDelay } from "@/lib/realtimeTopic";
import type { Comment, Reaction, ReactionKind } from "@/lib/types";

import type { FeedbackTarget } from "@/lib/feedback";

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

function targetColumns(target: FeedbackTarget) {
  if ("postId" in target) return { post_id: target.postId, episode_id: null };
  if ("episodeId" in target) return { post_id: null, episode_id: target.episodeId };
  // photo_id is sent only for a photo, so stories and episodes keep working on
  // a database that does not have the column yet (00077)
  return { post_id: null, episode_id: null, photo_id: target.photoId };
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

/** The guest who wrote it, or a parent (00076). Text only - the trigger pins
 *  the rest. */
export async function updateComment(id: string, body: string): Promise<void> {
  const { data, error } = await requireClient()
    .from("comments")
    .update({ body: body.trim() })
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message);
  // RLS filters a row it will not let you touch instead of failing
  if (!data || data.length === 0) throw new Error("not allowed");
}

export async function deleteComment(id: string): Promise<void> {
  const { error } = await requireClient().from("comments").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export const FEEDBACK_REFRESH_MS = 30_000;

/**
 * Keeps likes and comments fresh without realtime. In the 100-user load test
 * the live like/comment stream was ~85% of all realtime traffic: every like
 * went out to every open screen, which pushed the project past Free tier's
 * realtime messages-per-second cap and delayed the wall by 8-15 s. The wall
 * stays live; likes and comments reload when the screen opens (the caller),
 * when it comes back into view, and about every 30 s while it is visible. Your own
 * like or comment still shows at once (the card reloads after it).
 */
export function pollFeedback(reload: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    // spread, so a crowd that opened the app together does not ask together
    timer = setTimeout(() => {
      if (document.visibilityState === "visible") reload();
      schedule();
    }, spreadDelay(FEEDBACK_REFRESH_MS / 3)); // 10-50 s, 30 on average
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") reload();
  };
  schedule();
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    if (timer) clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
