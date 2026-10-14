import { realtimeTopic } from "@/lib/realtimeTopic";
import { getSupabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";

export type WallMessage = Tables<"messages">;

/**
 * One wall (migration 00049): parents, kids and guests on `channel = 'guests'`.
 * A kid's message waits for a parent (`approved_at` null) before guests see
 * it; every other sender's goes out at once. RLS and the approval trigger
 * enforce this - the client only decides what to render. The family feed
 * (`channel = 'family'`, 00027) is retired and no longer read or written.
 */
export const WALL_CHANNEL = "guests" as const;

/** Waiting for a parent to approve it. */
export function isPending(message: Pick<WallMessage, "approved_at">): boolean {
  return message.approved_at === null;
}

/** Unread = someone else's message with no read row of mine. */
export function unreadCount(
  messages: Pick<WallMessage, "id" | "sender_id">[],
  readIds: Set<string>,
  memberId: string
): number {
  return messages.filter((m) => m.sender_id !== memberId && !readIds.has(m.id)).length;
}

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

/** The wall. RLS hides other kids' pending messages and, from guests, all of them. */
export async function listMessages(tripId: string): Promise<WallMessage[]> {
  const { data, error } = await requireClient()
    .from("messages")
    .select("*")
    .eq("trip_id", tripId)
    .eq("channel", WALL_CHANNEL)
    .order("created_at");
  if (error) throw new Error(error.message);
  return data;
}

export async function sendMessage(
  tripId: string,
  senderId: string,
  body: string
): Promise<void> {
  const { error } = await requireClient().from("messages").insert({
    trip_id: tripId,
    sender_id: senderId,
    body: body.trim(),
    channel: WALL_CHANNEL,
  });
  if (error) throw new Error(error.message);
}

/** Owner: let a kid's message out. The trigger stamps who and when. */
export async function approveMessage(id: string): Promise<void> {
  const { error } = await requireClient()
    .from("messages")
    .update({ approved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Owner rejects a message, or a kid takes back their own pending one. */
export async function deleteMessage(id: string): Promise<void> {
  const { error } = await requireClient().from("messages").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Marks the given messages read for this member (upsert = idempotent). */
export async function markRead(
  memberId: string,
  messageIds: string[]
): Promise<void> {
  if (messageIds.length === 0) return;
  const { error } = await requireClient()
    .from("message_reads")
    .upsert(
      messageIds.map((id) => ({ message_id: id, member_id: memberId })),
      { onConflict: "message_id,member_id", ignoreDuplicates: true }
    );
  if (error) throw new Error(error.message);
}

/** Unread badge count: wall messages without an own read row (excl. own). */
export async function countUnread(
  tripId: string,
  memberId: string
): Promise<number> {
  const supabase = requireClient();
  const [{ data: msgs, error }, { data: reads, error: readsError }] =
    await Promise.all([
      // RLS limits this to what the caller may read, so the badge counts
      // exactly what they can open
      supabase
        .from("messages")
        .select("id, sender_id")
        .eq("trip_id", tripId)
        .eq("channel", WALL_CHANNEL),
      supabase
        .from("message_reads")
        .select("message_id")
        .eq("member_id", memberId),
    ]);
  if (error || readsError) return 0;
  return unreadCount(msgs ?? [], new Set((reads ?? []).map((r) => r.message_id)), memberId);
}

export function subscribeMessages(onChange: () => void): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};
  const channel = supabase
    .channel(realtimeTopic("messages-sync"))
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "messages" },
      onChange
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
