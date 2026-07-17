import { getSupabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";

export type WallMessage = Tables<"messages">;

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

/** One shared family wall (DECISIONS #15) — RLS grants all roles the feed. */
export async function listMessages(tripId: string): Promise<WallMessage[]> {
  const { data, error } = await requireClient()
    .from("messages")
    .select("*")
    .eq("trip_id", tripId)
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
    .channel("messages-sync")
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
