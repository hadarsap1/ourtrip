import { FunctionsHttpError } from "@supabase/supabase-js";
import { realtimeTopic } from "@/lib/realtimeTopic";
import { getSupabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

// Friends and their private chats (migrations 00110, 00111, DECISIONS #79). A
// kid and a friend write; they and the parents read. One friend may have a
// separate chat with each of several kids. All of it enforced by RLS.

export type FriendChannel = Database["public"]["Functions"]["my_friend_channels"]["Returns"][number];
export type FriendMessage = Database["public"]["Tables"]["friend_messages"]["Row"];
/** A parent's view of an invitation: everything but the code's hash. */
export type FriendLink = Omit<Database["public"]["Tables"]["friend_links"]["Row"], "code_hash">;

const LINK_COLUMNS =
  "id, trip_id, kid_member_id, member_id, friend_name, labels, expires_at, used_at, revoked_at, created_by, created_at";

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

/** The live chats the caller may open: a kid's and a friend's own, all of
 *  them for a parent, none for anyone else. */
export async function listFriendChannels(): Promise<FriendChannel[]> {
  const { data, error } = await requireClient().rpc("my_friend_channels");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listFriendMessages(linkId: string): Promise<FriendMessage[]> {
  const { data, error } = await requireClient()
    .from("friend_messages")
    .select("*")
    .eq("link_id", linkId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return data.reverse();
}

export async function sendFriendMessage(
  channel: Pick<FriendChannel, "link_id" | "trip_id">,
  senderId: string,
  body: string
): Promise<void> {
  const { error } = await requireClient().from("friend_messages").insert({
    link_id: channel.link_id,
    trip_id: channel.trip_id,
    sender_id: senderId,
    body: body.trim(),
  });
  if (error) throw new Error(error.message);
}

/** Parents only (RLS). */
export async function deleteFriendMessage(id: string): Promise<void> {
  const { error } = await requireClient().from("friend_messages").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function markFriendRead(linkId: string): Promise<void> {
  const { error } = await requireClient().rpc("mark_friend_read", { p_link_id: linkId });
  if (error) throw new Error(error.message);
}

/** New and deleted messages of one chat. A new one reloads the chat; a delete
 *  hands over the id, and the screen drops it only if it is one of its own. */
export function subscribeFriendMessages(
  linkId: string,
  onInsert: () => void,
  onDelete: (messageId: string) => void
): () => void {
  const supabase = requireClient();
  const channel = supabase
    .channel(realtimeTopic(`friend:${linkId}`))
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "friend_messages", filter: `link_id=eq.${linkId}` },
      onInsert
    )
    // a delete carries only the id, so it cannot be filtered by chat on the
    // server; any chat's delete arrives here and the screen sorts it out
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "friend_messages" },
      (payload) => {
        const id = (payload.old as { id?: string } | null)?.id;
        if (id) onDelete(id);
      }
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

// ---------- parents ----------

export async function listFriendLinks(tripId: string): Promise<FriendLink[]> {
  const { data, error } = await requireClient()
    .from("friend_links")
    .select(LINK_COLUMNS)
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function createFriendCode(kidMemberId: string, friendName: string, labels: string[]): Promise<string> {
  const { data, error } = await requireClient().functions.invoke("friend-auth", {
    body: { action: "create-code", kid_member_id: kidMemberId, friend_name: friendName.trim(), labels },
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = (await error.context.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? "failed");
    }
    throw new Error("network");
  }
  if (!data?.ok) throw new Error(data?.error ?? "failed");
  return data.code as string;
}

/** A separate chat between a connected friend and another kid (00111). */
export async function addFriendKid(linkId: string, kidMemberId: string): Promise<void> {
  const { data, error } = await requireClient().rpc("friend_add_kid", {
    p_link_id: linkId,
    p_kid_member_id: kidMemberId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("not allowed");
}

/** Closes one chat; the friend stays connected through the others. Closing
 *  the last one cuts the friend off (00111). */
export async function closeFriendChat(linkId: string): Promise<void> {
  const { data, error } = await requireClient().rpc("friend_close_chat", { p_link_id: linkId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("not allowed");
}

/** Cuts a friend off (every chat of theirs), or cancels a code that was not used. */
export async function revokeFriend(linkId: string): Promise<void> {
  const { data, error } = await requireClient().rpc("friend_revoke", { p_link_id: linkId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("not allowed");
}
