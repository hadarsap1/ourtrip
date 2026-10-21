import { realtimeTopic, spreadDelay } from "@/lib/realtimeTopic";
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

// Ids this device already sent a read row for. The wall re-marks on every
// change it shows, and with many people writing, upserting the whole wall each
// time was one write per message per reader per change.
const markedRead = new Set<string>();

/** Marks the given messages read for this member (upsert = idempotent). */
export async function markRead(
  memberId: string,
  messageIds: string[]
): Promise<void> {
  const fresh = messageIds.filter((id) => !markedRead.has(`${memberId}:${id}`));
  if (fresh.length === 0) return;
  const { error } = await requireClient()
    .from("message_reads")
    .upsert(
      fresh.map((id) => ({ message_id: id, member_id: memberId })),
      { onConflict: "message_id,member_id", ignoreDuplicates: true }
    );
  if (error) throw new Error(error.message);
  for (const id of fresh) markedRead.add(`${memberId}:${id}`);
}

/**
 * Opening the wall: marks every message on it read that is not yet, in one
 * call (00060), instead of upserting the whole id list. With 100 people
 * opening at once that upsert was the slowest request of all. The ids on
 * screen are remembered so realtime batches skip them.
 */
export async function markWallRead(
  tripId: string,
  memberId: string,
  messageIds: string[]
): Promise<void> {
  const { error } = await requireClient().rpc("mark_wall_read", { p_trip_id: tripId });
  if (error) throw new Error(error.message);
  for (const id of messageIds) markedRead.add(`${memberId}:${id}`);
}

// Reads that arrive with realtime are sent in batches: one upsert per reader
// every few seconds instead of one per message. With 100 people on the wall
// that was the most frequent request of all in the load test.
const queuedReads = new Map<string, Set<string>>();
let readFlush: ReturnType<typeof setTimeout> | null = null;

/** Marks a message read soon, batched with others (see markRead for now). */
export function markReadSoon(memberId: string, messageId: string): void {
  if (markedRead.has(`${memberId}:${messageId}`)) return;
  if (!queuedReads.has(memberId)) queuedReads.set(memberId, new Set());
  queuedReads.get(memberId)!.add(messageId);
  readFlush ??= setTimeout(() => {
    readFlush = null;
    const batches = [...queuedReads.entries()];
    queuedReads.clear();
    // a failed batch is not lost: the next visit to the wall marks it again
    for (const [member, ids] of batches) void markRead(member, [...ids]).catch(() => {});
  }, spreadDelay(2000));
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

/** One wall change as realtime delivers it - already filtered by the reader's RLS. */
export type WallChange = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Partial<WallMessage>;
  old: Partial<WallMessage>;
};

/** Whether a realtime change carries enough to apply without a refetch. */
export function canApplyWallChange(change: WallChange): boolean {
  if (change.eventType === "DELETE") return Boolean(change.old.id);
  return Boolean(change.new.id && change.new.created_at);
}

/**
 * Applies a realtime change to the wall on screen, so a new message costs each
 * reader nothing but the event. Refetching the whole wall on every change made
 * N writers cost N x readers queries. Check canApplyWallChange first.
 */
export function applyWallChange(list: WallMessage[], change: WallChange): WallMessage[] {
  if (!canApplyWallChange(change)) return list;
  if (change.eventType === "DELETE") return list.filter((m) => m.id !== change.old.id);
  const row = change.new as WallMessage;
  if (row.channel !== WALL_CHANNEL) return list;
  const rest = list.filter((m) => m.id !== row.id);
  rest.push(row);
  return rest.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

// Every screen and badge that watches the wall shares one channel: the tab
// bar, the side rail, the home tile and the wall itself used to open one each,
// and every message was delivered (and RLS-checked) once per channel.
type WallListener = (change: WallChange) => void;
const wallListeners = new Set<WallListener>();
let wall: { tripId: string; close: () => void } | null = null;

function openWallChannel(tripId: string): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};
  const deliver = (payload: unknown) => {
    const change = payload as WallChange;
    for (const listener of [...wallListeners]) listener(change);
  };
  const channel = supabase
    .channel(realtimeTopic("messages-sync"))
    // only this trip's rows; DELETE cannot be filtered server-side, and its
    // payload carries the id alone, so it stays unfiltered
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `trip_id=eq.${tripId}` },
      deliver
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "messages", filter: `trip_id=eq.${tripId}` },
      deliver
    )
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, deliver)
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeMessages(tripId: string, onChange: WallListener): () => void {
  if (wall && wall.tripId !== tripId) {
    wall.close();
    wall = null;
  }
  wall ??= { tripId, close: openWallChannel(tripId) };
  wallListeners.add(onChange);
  return () => {
    wallListeners.delete(onChange);
    if (wallListeners.size === 0 && wall) {
      wall.close();
      wall = null;
    }
  };
}
