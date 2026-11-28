"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { askConfirm } from "@/components/ConfirmSheet";
import { LoadFailed } from "@/components/LoadFailed";
import { ChatPushInvite } from "@/components/friends/ChatPushInvite";
import { ChevronForwardIcon, TrashIcon } from "@/components/icons";
import { Composer } from "@/components/ui/Composer";
import {
  deleteFriendMessage,
  listFriendMessages,
  markFriendRead,
  sendFriendMessage,
  subscribeFriendMessages,
  type FriendChannel,
  type FriendMessage,
} from "@/lib/data/friends";
import { formatShortDate } from "@/lib/format";
import { clearNotifications } from "@/lib/push";
import { strings } from "@/lib/strings";
import type { Member } from "@/lib/types";

/** One private chat. A parent reads (and may delete); the kid and the friend
 *  write. Who may do what is the database's decision (00110). */
export function FriendChat({
  channel,
  member,
  onBack,
}: {
  channel: FriendChannel;
  member: Member;
  /** back to the list, when there is one to go back to */
  onBack: (() => void) | null;
}) {
  const f = strings.friends;
  const [messages, setMessages] = useState<FriendMessage[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const isParent = member.role === "owner";
  const isFriend = member.id === channel.friend_member_id;

  // the composer is the last thing on the screen: no room under it (see wall)
  useEffect(() => {
    document.body.dataset.chat = "1";
    return () => {
      delete document.body.dataset.chat;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      setMessages(await listFriendMessages(channel.link_id));
      setLoadFailed(false);
      void markFriendRead(channel.link_id).catch(() => {});
      // read here: its notification on this tablet goes (00112)
      void clearNotifications(`friend-${channel.link_id}`);
    } catch {
      setLoadFailed(true);
    }
  }, [channel.link_id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is set after the fetch
    void load();
    const unsubscribe = subscribeFriendMessages(
      channel.link_id,
      () => void load(),
      // another chat's delete is ignored; this chat's is dropped in place, no refetch
      (id) => setMessages((prev) => (prev && prev.some((m) => m.id === id) ? prev.filter((m) => m.id !== id) : prev))
    );
    // a phone that slept missed what was sent meanwhile
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [channel.link_id, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    setBody("");
    try {
      await sendFriendMessage(channel, member.id, text);
      await load();
    } catch {
      setBody(text);
      setError(f.sendFailed);
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(id: string) {
    if (!(await askConfirm(f.deleteConfirm))) return;
    try {
      await deleteFriendMessage(id);
      await load();
    } catch {
      setError(strings.common.error);
    }
  }

  const title = isParent
    ? f.pair.replace("{kid}", channel.kid_name).replace("{friend}", channel.friend_name)
    : f.withName.replace("{name}", isFriend ? channel.kid_name : channel.friend_name);
  const privacy = isParent
    ? f.privacyParent
    : isFriend
      ? f.privacyFriend.replace("{kid}", channel.kid_name)
      : f.privacyKid;
  const nameOf = (senderId: string) => (senderId === channel.friend_member_id ? channel.friend_name : channel.kid_name);

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col gap-3 px-4 pt-[26px] sm:max-w-2xl">
      <header className="flex items-center gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={f.back}
            className="-ms-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft active:bg-paper-deep"
          >
            <ChevronForwardIcon className="h-6 w-6 rotate-180" />
          </button>
        )}
        <h1 className="ot-title min-w-0 truncate">{title}</h1>
      </header>
      <p className="rounded-xl bg-sun-tint px-3 py-2 text-sm font-medium text-sun-deep">{privacy}</p>
      {!isParent && <ChatPushInvite />}

      <div className="flex flex-1 flex-col justify-end gap-2">
        {loadFailed && <LoadFailed onRetry={load} />}
        {messages === null && !loadFailed && (
          <p className="text-center text-ink-soft">{strings.common.loading}</p>
        )}
        {messages?.length === 0 && <p className="py-8 text-center text-sm text-ink-soft">{f.chatEmpty}</p>}
        {messages?.map((m) => {
          // a parent sees the family's side on one edge, the friend on the other
          const mine = isParent ? m.sender_id === channel.kid_member_id : m.sender_id === member.id;
          return (
            <div key={m.id} className={`flex items-end gap-1 ${mine ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2 shadow-sm ${
                  mine ? "bg-green-soft" : "border border-line bg-surface"
                }`}
              >
                <p className="text-xs font-bold text-muted">{nameOf(m.sender_id)}</p>
                <p className="whitespace-pre-wrap break-words text-ink" dir="auto">
                  {m.body}
                </p>
                <p className="text-end text-xs text-muted">
                  <bdi>
                    {formatShortDate(new Date(m.created_at).toLocaleDateString("en-CA"))}{" "}
                    {new Date(m.created_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                  </bdi>
                </p>
              </div>
              {isParent && (
                <button
                  type="button"
                  onClick={() => void handleDelete(m.id)}
                  aria-label={f.delete}
                  className="flex h-11 w-11 shrink-0 items-center justify-center text-ink-soft"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}
        {/* a parent has no composer under the list: room for the bottom bar */}
        <div ref={bottomRef} className={isParent ? "h-[var(--nav-room)] shrink-0 lg:h-4" : undefined} />
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-alert-tint px-3 py-2 text-center text-sm text-alert">
          {error}
        </p>
      )}

      {!isParent && (
        <div className="ot-dock sticky bottom-0 -mx-4 bg-bg px-3 pt-2 pb-3">
          <Composer
            value={body}
            onChange={setBody}
            onSubmit={(e) => void handleSend(e)}
            placeholder={f.placeholder}
            label={f.inputLabel}
            disabled={sending}
            maxLength={1000}
          />
        </div>
      )}
    </div>
  );
}
