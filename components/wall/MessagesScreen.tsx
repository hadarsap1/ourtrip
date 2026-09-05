"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Toast } from "@/components/Toast";
import { getActiveTrip, listMembers } from "@/lib/data/trip";
import {
  channelsFor,
  listMessages,
  markRead,
  sendMessage,
  subscribeMessages,
  type MessageChannel,
  type WallMessage,
} from "@/lib/data/messages";
import { formatShortDate } from "@/lib/format";
import { MessagesIcon } from "@/components/icons";
import { strings } from "@/lib/strings";
import { useMember } from "@/lib/useMember";
import type { Member, Trip } from "@/lib/types";

export function MessagesScreen() {
  const { member, memberLoading } = useMember();
  // Which feeds this role may open (migration 00027): owners get both and act
  // as the bridge, kids only the family one, guests only theirs. RLS enforces
  // it regardless - this just decides what to render.
  const channels = channelsFor(member?.role);
  const [channel, setChannel] = useState<MessageChannel>(channels[0]);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<WallMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const refresh = useCallback(
    async (tripId: string, memberId: string | null, feed: MessageChannel) => {
      const next = await listMessages(tripId, feed);
      setMessages(next);
      // reading a feed marks its messages read → unread badges clear
      if (memberId) {
        void markRead(memberId, next.map((m) => m.id)).catch(() => {});
      }
    },
    []
  );

  useEffect(() => {
    // Nothing to fetch until a member is resolved. When resolution finishes
    // and produces nobody, `loading` is left as-is on purpose - the render
    // below only treats it as meaningful once a member exists.
    if (memberLoading || !member) return;
    let cancelled = false;
    let unsubscribe = () => {};
    let debounce: ReturnType<typeof setTimeout> | null = null;

    void (async () => {
      const activeTrip = await getActiveTrip();
      if (cancelled || !activeTrip) {
        setLoading(false);
        return;
      }
      setTrip(activeTrip);
      try {
        await refresh(activeTrip.id, member.id, channel);
        const tripMembers = await listMembers(activeTrip.id);
        if (!cancelled) setMembers(tripMembers);
      } catch {
        if (!cancelled) showToast(strings.common.error);
      } finally {
        if (!cancelled) setLoading(false);
      }

      unsubscribe = subscribeMessages(() => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          void refresh(activeTrip.id, member.id, channel).catch(() => {});
        }, 200);
      });
    })();

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      unsubscribe();
    };
  }, [member, memberLoading, refresh, showToast, channel]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!trip || !member || !body.trim() || sending) return;
    setSending(true);
    const text = body;
    setBody("");
    try {
      await sendMessage(trip.id, member.id, text, channel);
      await refresh(trip.id, member.id, channel);
    } catch {
      setBody(text);
      showToast(strings.common.error);
    } finally {
      setSending(false);
    }
  }

  // `loading` only means "this member's data is on its way", so it is only
  // consulted once there IS a member. Previously the guard was
  // `loading || !member`, which meant a failed member lookup (an expired
  // session returns 401) left the screen on "loading…" forever, with nothing
  // said and nothing to act on - reported from production 2026-08-29.
  if (memberLoading || (member && loading)) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-8">
        <p className="text-center text-ink-soft">{strings.common.loading}</p>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-8 text-center">
        <p className="mb-3 text-ink-soft">{strings.common.noMember}</p>
        <Link href="/login" className="font-semibold text-sea underline">
          {strings.common.signInAgain}
        </Link>
      </div>
    );
  }

  const senderName = (id: string) =>
    id === member.id
      ? strings.wall.me
      : (members.find((m) => m.id === id)?.display_name ?? "");

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-5rem)] max-w-lg flex-col px-4 pt-4">
      <h1 className="mb-3 text-2xl font-bold">
        <MessagesIcon className="inline-block h-5 w-5 align-text-bottom text-sea" />{" "}
          {channel === "guests" ? strings.wall.guestTitle : strings.wall.title}
      </h1>

      {/* Owners are the only role with more than one feed to switch between. */}
      {channels.length > 1 && (
        <div className="mb-3 flex gap-2" role="tablist">
          {channels.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={c === channel}
              onClick={() => setChannel(c)}
              className={`flex-1 rounded-2xl px-3 py-2 text-sm font-semibold ${
                c === channel
                  ? "bg-sea text-white"
                  : "bg-white text-ink-soft border border-line"
              }`}
            >
              {c === "guests" ? strings.wall.guestTab : strings.wall.familyTab}
            </button>
          ))}
        </div>
      )}

      <p className="mb-2 text-xs text-ink-soft">
        {channel === "guests" ? strings.wall.guestHint : strings.wall.familyHint}
      </p>

      <div className="flex-1 space-y-2 overflow-y-auto pb-3">
        {messages.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-ink-soft">
            {strings.wall.empty}
          </p>
        ) : (
          messages.map((message) => {
            const mine = message.sender_id === member.id;
            return (
              <div
                key={message.id}
                className={`max-w-[85%] rounded-2xl px-3 py-2 shadow-sm ${
                  mine
                    ? "mr-auto bg-sea text-white"
                    : "ml-auto bg-white text-ink"
                }`}
              >
                <p
                  className={`text-xs font-semibold ${
                    mine ? "text-sea-tint" : "text-sea"
                  }`}
                >
                  {senderName(message.sender_id)}
                  <span
                    className={`mr-1.5 font-normal ${
                      mine ? "text-sea-tint" : "text-ink-soft"
                    }`}
                  >
                    {formatShortDate(message.created_at.slice(0, 10))}
                  </span>
                </p>
                <p className="whitespace-pre-wrap break-words">{message.body}</p>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => void handleSend(e)}
        className="sticky bottom-20 flex gap-2 bg-paper-deep py-2"
      >
        <input
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={strings.wall.placeholder}
          className="min-w-0 flex-1 rounded-2xl border border-line bg-white px-4 py-3 text-base focus:border-sea focus:outline-none"
        />
        <button
          type="submit"
          disabled={sending || !body.trim()}
          className="shrink-0 rounded-2xl bg-sea px-4 py-3 font-bold text-white disabled:opacity-50"
        >
          {strings.wall.send}
        </button>
      </form>

      <Toast message={toast} />
    </div>
  );
}
