"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Toast } from "@/components/Toast";
import { getActiveTrip, listMembers } from "@/lib/data/trip";
import {
  applyWallChange,
  approveMessage,
  canApplyWallChange,
  deleteMessage,
  isPending,
  listMessages,
  markReadSoon,
  markWallRead,
  sendMessage,
  setMessageAudience,
  subscribeMessages,
  type WallMessage,
} from "@/lib/data/messages";
import { listMyGroups } from "@/lib/data/groups";
import { audienceForTab, audienceText, EVERYONE, inTab, tabKey, wallTabs, type WallTab } from "@/lib/audience";
import { AudienceSheet } from "@/components/AudienceSheet";
import { askConfirm } from "@/components/ConfirmSheet";
import { formatShortDate } from "@/lib/format";
import { MessagesIcon, TrashIcon } from "@/components/icons";
import { strings } from "@/lib/strings";
import { spreadDelay } from "@/lib/realtimeTopic";
import { useMember } from "@/lib/useMember";
import type { Member, Trip } from "@/lib/types";

export function MessagesScreen() {
  const { member, memberLoading, memberFailed } = useMember();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<WallMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // group tabs (00063): the groups this member may read and write in
  const [groups, setGroups] = useState<string[]>([]);
  const [tab, setTab] = useState<WallTab>(EVERYONE);
  // anyone may send to more than the open tab (a guest: of their own groups);
  // null = the tab's group
  const [sendTo, setSendTo] = useState<string[] | null>(null);
  // the audience sheet: for the composer, or for one (pending) message
  const [audienceFor, setAudienceFor] = useState<"compose" | WallMessage | null>(null);
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
      // reading a feed marks its messages read → unread badges clear
      if (memberId) {
        void markWallRead(tripId, memberId, next.map((m) => m.id)).catch(() => {});
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
        await refresh(activeTrip.id, member.id);
        const [tripMembers, myGroups] = await Promise.all([
          listMembers(activeTrip.id),
          // no groups (or a failed lookup) = the wall as it always was
          listMyGroups(member.role).catch(() => []),
        ]);
        if (!cancelled) {
          setMembers(tripMembers);
          setGroups(myGroups);
        }
      } catch {
        if (!cancelled) showToast(strings.common.error);
      } finally {
        if (!cancelled) setLoading(false);
      }

      // The screen may have closed during the awaits above: subscribing now
      // would leave a channel no cleanup ever removes.
      if (cancelled) return;
      // A change is applied from its payload; only one that cannot be (no
      // row in it) costs a refetch, spread out so a crowd of readers does not
      // ask at the same instant.
      unsubscribe = subscribeMessages(activeTrip.id, (change) => {
        if (canApplyWallChange(change)) {
          setMessages((list) => applyWallChange(list, change));
          const row = change.new;
          if (change.eventType !== "DELETE" && row.id && row.sender_id !== member.id) {
            markReadSoon(member.id, row.id);
          }
          return;
        }
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          void refresh(activeTrip.id, member.id).catch(() => {});
        }, spreadDelay(200));
      });
    })();

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      unsubscribe();
    };
  }, [member, memberLoading, refresh, showToast]);

  // The family (parents and kids, 00064) also gets a tab for a group that only
  // shows up on a message; a guest's tabs are exactly their own groups, so a
  // tab is always one they may write in.
  const tabs = useMemo(
    () => wallTabs(groups, member && member.role !== "guest" ? messages : []),
    [groups, messages, member]
  );
  const shown = tabs.length > 0 ? inTab(messages, tab) : messages;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [shown.length, tab]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!trip || !member || !body.trim() || sending) return;
    setSending(true);
    const text = body;
    setBody("");
    try {
      await sendMessage(trip.id, member.id, text, sendTo ?? audienceForTab(tab));
      // a wider audience is for one message, never the next one by accident
      setSendTo(null);
      await refresh(trip.id, member.id);
      if (member.role === "kid") showToast(strings.wall.sentForApproval);
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

  // A lookup that failed is not an expired session: offer a retry, not a
  // sign-out (see lib/useMember.ts).
  if (memberFailed) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-8 text-center">
        <h1 className="mb-3 text-2xl font-bold">{strings.wall.title}</h1>
        <p className="mb-3 text-ink-soft">{strings.common.memberFailed}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex min-h-[44px] items-center font-semibold text-sea underline"
        >
          {strings.common.retry}
        </button>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-8 text-center">
        <h1 className="mb-3 text-2xl font-bold">{strings.wall.title}</h1>
        <p className="mb-3 text-ink-soft">{strings.common.noMember}</p>
        <Link href="/login" className="inline-flex min-h-[44px] items-center font-semibold text-sea underline">
          {strings.common.signInAgain}
        </Link>
      </div>
    );
  }

  const senderName = (id: string) =>
    id === member.id
      ? strings.wall.me
      : (members.find((m) => m.id === id)?.display_name ?? "");
  const isOwner = member.role === "owner";
  const hint =
    member.role === "owner"
      ? strings.wall.ownerHint
      : member.role === "kid"
        ? strings.wall.kidHint
        : strings.wall.guestHint;

  // Approving, rejecting and taking back are each one write RLS already
  // allows this role (00049); the list refreshes from the server after.
  const act = (fn: () => Promise<void>) => {
    if (!trip) return;
    void fn()
      .then(() => refresh(trip.id, member.id))
      .catch(() => showToast(strings.common.error));
  };

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col px-4 pt-4">
      <h1 className="mb-3 text-2xl font-bold">
        <MessagesIcon className="inline-block h-5 w-5 align-text-bottom text-sea" />{" "}
        {strings.wall.title}
      </h1>

      <p className="mb-2 text-xs text-ink-soft">{hint}</p>

      {tabs.length > 0 && (
        <nav aria-label={strings.wall.tabs} className="-mx-4 mb-2 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {tabs.map((t) => {
            const on = tabKey(t) === tabKey(tab);
            const waiting = isOwner && inTab(messages, t).some(isPending);
            return (
              <button
                key={tabKey(t)}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setTab(t);
                  setSendTo(null);
                }}
                className={`relative shrink-0 rounded-full border px-3 py-1.5 text-sm ${
                  on ? "border-sea bg-sea font-semibold text-on-sea" : "border-line bg-surface text-ink-soft"
                }`}
              >
                {t.kind === "everyone" ? strings.wall.everyoneTab : t.label}
                {waiting && (
                  <span
                    aria-label={strings.wall.pendingInTab}
                    className="absolute -top-0.5 -end-0.5 h-2.5 w-2.5 rounded-full bg-sun-deep"
                  />
                )}
              </button>
            );
          })}
        </nav>
      )}
      {tab.kind === "group" && (
        <p className="mb-2 text-xs text-ink-soft">{strings.wall.groupHint.replace("{group}", tab.label)}</p>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto pb-3">
        {shown.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink-soft">
            {strings.wall.empty}
          </p>
        ) : (
          shown.map((message) => {
            const mine = message.sender_id === member.id;
            const pending = isPending(message);
            const soft = mine ? "text-sea-tint" : "text-ink-soft";
            return (
              <div
                key={message.id}
                className={`max-w-[85%] rounded-2xl px-3 py-2 shadow-sm ${
                  mine
                    ? "ms-auto bg-sea text-on-sea"
                    : "me-auto bg-surface text-ink"
                } ${pending ? "border-2 border-dashed border-sun-deep" : ""}`}
              >
                <div className="flex items-start gap-2">
                  <p
                    className={`flex-1 text-xs font-semibold ${
                      mine ? "text-sea-tint" : "text-sea"
                    }`}
                  >
                    {senderName(message.sender_id)}
                    <span
                      className={`ms-1.5 font-normal ${
                        mine ? "text-sea-tint" : "text-ink-soft"
                      }`}
                    >
                      {formatShortDate(message.created_at.slice(0, 10))}
                    </span>
                  </p>
                  {/* a parent deletes any message once it is out (messages_owner_all);
                      a pending one keeps its own "לא לשלוח" below */}
                  {isOwner && !pending && (
                    <button
                      type="button"
                      aria-label={strings.wall.remove}
                      onClick={async () => {
                        if (!(await askConfirm(strings.wall.removeConfirm))) return;
                        act(() => deleteMessage(message.id).then(() => showToast(strings.wall.removed)));
                      }}
                      className={`-me-1.5 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                        mine ? "text-sea-tint active:bg-on-sea/15" : "text-ink-soft active:bg-paper-deep"
                      }`}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <p className="whitespace-pre-wrap break-words">{message.body}</p>
                {/* who a message to several groups went to; parents also see
                    a waiting one's and change it - the kid's choice is a suggestion */}
                {((isOwner && pending) || message.audience.length > 1) && (
                  <p className={`mt-1 text-xs ${soft}`}>
                    {strings.wall.audienceOf.replace(
                      "{to}",
                      audienceText(message.audience) ?? strings.audience.everyone
                    )}
                    {pending && (
                      <button
                        type="button"
                        onClick={() => setAudienceFor(message)}
                        className="ms-1.5 font-semibold underline"
                      >
                        {strings.wall.changeAudience}
                      </button>
                    )}
                  </p>
                )}
                {pending && (
                  <div className={`mt-1.5 flex flex-wrap items-center gap-2 text-xs font-semibold ${soft}`}>
                    <span>{strings.wall.pending}</span>
                    {isOwner && (
                      <>
                        <button
                          type="button"
                          onClick={() => act(() => approveMessage(message.id))}
                          className="min-h-9 rounded-full bg-sea px-3 font-bold text-on-sea"
                        >
                          {strings.wall.approve}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!(await askConfirm(strings.wall.rejectConfirm))) return;
                            act(() => deleteMessage(message.id));
                          }}
                          className="min-h-9 rounded-full border border-line bg-surface px-3 font-bold text-ink-soft"
                        >
                          {strings.wall.reject}
                        </button>
                      </>
                    )}
                    {mine && !isOwner && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!(await askConfirm(strings.wall.takeBackConfirm))) return;
                          act(() => deleteMessage(message.id));
                        }}
                        className="min-h-9 font-bold underline"
                      >
                        {strings.wall.takeBack}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {tabs.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-ink-soft">
          {(sendTo ?? audienceForTab(tab)).length === 0
            ? strings.wall.sendingToEveryone
            : strings.wall.sendingTo.replace("{to}", audienceText(sendTo ?? audienceForTab(tab))!)}
          {groups.length > 1 && (
            <button
              type="button"
              onClick={() => setAudienceFor("compose")}
              className="min-h-8 font-semibold text-sea underline"
            >
              {strings.wall.changeAudience}
            </button>
          )}
        </p>
      )}
      <form
        onSubmit={(e) => void handleSend(e)}
        className="sticky bottom-0 flex gap-2 bg-paper-deep py-2"
      >
        <input
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={strings.wall.placeholder}
          className="min-w-0 flex-1 rounded-2xl border border-line bg-surface px-4 py-3 text-base focus:border-sea focus:outline-none"
        />
        <button
          type="submit"
          disabled={sending || !body.trim()}
          className="shrink-0 rounded-2xl bg-sea px-4 py-3 font-bold text-on-sea disabled:opacity-50"
        >
          {strings.wall.send}
        </button>
      </form>

      {audienceFor && (
        <AudienceSheet
          groups={groups}
          value={audienceFor === "compose" ? (sendTo ?? audienceForTab(tab)) : audienceFor.audience}
          onClose={() => setAudienceFor(null)}
          onSave={async (audience) => {
            if (audienceFor === "compose") {
              setSendTo(audience);
              setAudienceFor(null);
              return;
            }
            const id = audienceFor.id;
            setAudienceFor(null);
            act(() => setMessageAudience(id, audience).then(() => showToast(strings.audience.saved)));
          }}
        />
      )}

      <Toast message={toast} />
    </div>
  );
}
