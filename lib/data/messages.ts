import { realtimeTopic } from "@/lib/realtimeTopic";
import { getSupabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";

export type WallMessage = Tables<"messages">;

/**
 * The two feeds (migration 00027, review finding M5).
 *   family - owners + kids. Guests cannot read or write it.
 *   guests - owners + guests. Kids cannot read or write it.
 * Parents are in both and bridge between them. RLS enforces this; the values
 * here only decide which feed the UI is looking at.
 */
export type MessageChannel = "family" | "guests";

/** Which feeds this role may open, in display order. */
export function channelsFor(role: string | undefined): MessageChannel[] {
  if (role === "owner") return ["family", "guests"];
  if (role === "guest") return ["guests"];
  return ["family"]; // kid
}

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

/** One feed. RLS decides whether the caller may see it at all. */
export async function listMessages(
  tripId: string,
  channel: MessageChannel
): Promise<WallMessage[]> {
  const { data, error } = await requireClient()
    .from("messages")
    .select("*")
    .eq("trip_id", tripId)
    .eq("channel", channel)
    .order("created_at");
  if (error) throw new Error(error.message);
  return data;
}

export async function sendMessage(
  tripId: string,
  senderId: string,
  body: string,
  channel: MessageChannel
): Promise<void> {
  const { error } = await requireClient().from("messages").insert({
    trip_id: tripId,
    sender_id: senderId,
    body: body.trim(),
    channel,
  });
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
      // no channel filter: RLS already limits this to the feeds the caller
      // may read, so the badge counts exactly what they can open
      supabase
        .from("messages")
        .select("id, sender_id")
        .eq("trip_id", tripId),
      supabase
        .from("message_reads")
        .select("message_id")
        .eq("member_id", memberId),
    ]);
  if (error || readsError) return 0;
  const readIds = new Set((reads ?? []).map((r) => r.message_id));
  return (msgs ?? []).filter(
    (m) => m.sender_id !== memberId && !readIds.has(m.id)
  ).length;
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

// ---------- the bridge (migration 00045, DESIGN-wall-bridge) ----------

/**
 * A parent copies ONE message into the other feed, in its author's name:
 * a kid's message to the guests, or a guest's message to the kids. The copy
 * is an ordinary row in a feed its readers could already read, so the 00027
 * channel policies are untouched; the original is stamped so its author
 * sees it went out. A second tap is a no-op (unique origin index).
 */
export async function bridgeMessage(
  message: WallMessage,
  to: MessageChannel,
  ownerId: string
): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.from("messages").insert({
    trip_id: message.trip_id,
    sender_id: message.sender_id,
    body: message.body,
    channel: to,
    origin_message_id: message.id,
    bridged_by: ownerId,
  });
  if (error && error.code !== "23505") throw new Error(error.message);
  const { error: stampError } = await supabase
    .from("messages")
    .update({ bridged_at: new Date().toISOString() })
    .eq("id", message.id);
  if (stampError) throw new Error(stampError.message);
}

/** Takes a bridged copy back out and clears the stamp on what it came from. */
export async function unbridgeMessage(copy: WallMessage): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.from("messages").delete().eq("id", copy.id);
  if (error) throw new Error(error.message);
  if (copy.origin_message_id) {
    await supabase.from("messages").update({ bridged_at: null }).eq("id", copy.origin_message_id);
  }
  if (copy.origin_comment_id) {
    await supabase
      .from("comments")
      .update({ shown_to_kids_at: null, shown_by: null })
      .eq("id", copy.origin_comment_id);
  }
}

/** Which feed a message may be bridged into, by its author's role. */
export function bridgeTarget(
  message: Pick<WallMessage, "channel" | "origin_message_id" | "origin_comment_id">,
  senderRole: string | undefined
): MessageChannel | null {
  if (message.origin_message_id || message.origin_comment_id) return null; // already a copy
  if (message.channel === "family" && senderRole === "kid") return "guests";
  if (message.channel === "guests" && senderRole === "guest") return "family";
  return null;
}
