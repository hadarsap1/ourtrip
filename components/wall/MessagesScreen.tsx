"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Toast } from "@/components/Toast";
import { getActiveTrip, listMembers } from "@/lib/data/trip";
import {
  listMessages,
  markRead,
  sendMessage,
  subscribeMessages,
  type WallMessage,
} from "@/lib/data/messages";
import { formatShortDate } from "@/lib/format";
import { strings } from "@/lib/strings";
import { useMember } from "@/lib/useMember";
import type { Member, Trip } from "@/lib/types";

export function MessagesScreen() {
  const { member } = useMember();
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
    async (tripId: string, memberId: string | null) => {
      const next = await listMessages(tripId);
      setMessages(next);
      // reading the wall marks everything read → unread badges clear
      if (memberId) {
        void markRead(memberId, next.map((m) => m.id)).catch(() => {});
      }
    },
    []
  );

  useEffect(() => {
    if (!member) return;
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
        await refresh(activeTrip.id, member.id);
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
          void refresh(activeTrip.id, member.id).catch(() => {});
        }, 200);
      });
    })();

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      unsubscribe();
    };
  }, [member, refresh, showToast]);

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
      await sendMessage(trip.id, member.id, text);
      await refresh(trip.id, member.id);
    } catch {
      setBody(text);
      showToast(strings.common.error);
    } finally {
      setSending(false);
    }
  }

  if (loading || !member) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-8">
        <p className="text-center text-slate-500">{strings.common.loading}</p>
      </div>
    );
  }

  const senderName = (id: string) =>
    id === member.id
      ? strings.wall.me
      : (members.find((m) => m.id === id)?.display_name ?? "");

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-5rem)] max-w-lg flex-col px-4 pt-4">
      <h1 className="mb-3 text-2xl font-bold">💬 {strings.wall.title}</h1>

      <div className="flex-1 space-y-2 overflow-y-auto pb-3">
        {messages.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
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
                    ? "mr-auto bg-teal-600 text-white"
                    : "ml-auto bg-white text-slate-800"
                }`}
              >
                <p
                  className={`text-xs font-semibold ${
                    mine ? "text-teal-100" : "text-teal-700"
                  }`}
                >
                  {senderName(message.sender_id)}
                  <span
                    className={`mr-1.5 font-normal ${
                      mine ? "text-teal-200" : "text-slate-400"
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
        className="sticky bottom-20 flex gap-2 bg-slate-50 py-2"
      >
        <input
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={strings.wall.placeholder}
          className="min-w-0 flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base focus:border-teal-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={sending || !body.trim()}
          className="shrink-0 rounded-2xl bg-teal-600 px-4 py-3 font-bold text-white disabled:opacity-50"
        >
          {strings.wall.send}
        </button>
      </form>

      <Toast message={toast} />
    </div>
  );
}
