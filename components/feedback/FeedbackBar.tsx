"use client";

import { useEffect, useRef, useState } from "react";
import { EditIcon, TrashIcon } from "@/components/icons";
import { EditTextSheet } from "@/components/EditTextSheet";
import { KidTag } from "@/components/KidTag";
import { NewDot } from "@/components/feedback/FeedbackCount";
import { askConfirm } from "@/components/ConfirmSheet";
import {
  addComment,
  addReaction,
  deleteComment,
  removeReaction,
  updateComment,
} from "@/lib/data/feedback";
import {
  matchesTarget,
  namesSummary,
  newFeedback,
  tallyReactions,
  targetKey,
  type FeedbackTarget,
} from "@/lib/feedback";
import { useFeedbackSeen } from "@/lib/useFeedbackSeen";
import { formatShortDate } from "@/lib/format";
import { nameWithKidTag } from "@/lib/kidTag";
import { strings } from "@/lib/strings";
import type { Comment, Member, Reaction, ReactionKind } from "@/lib/types";

const LABELS: Record<ReactionKind, string> = {
  heart: strings.feedback.reactionHeart,
  smile: strings.feedback.reactionSmile,
  wow: strings.feedback.reactionWow,
  star: strings.feedback.reactionStar,
};

function ReactionIcon({ kind, filled }: { kind: ReactionKind; filled: boolean }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", "aria-hidden": true as const };
  switch (kind) {
    case "heart":
      return (
        <svg {...common} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.75}>
          <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" strokeLinejoin="round" />
        </svg>
      );
    case "smile":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
          <circle cx="12" cy="12" r="8" fill={filled ? "currentColor" : "none"} fillOpacity={filled ? 0.18 : 0} />
          <path d="M8.5 14a4 4 0 0 0 7 0" />
          <circle cx="9.5" cy="10" r="0.6" fill="currentColor" />
          <circle cx="14.5" cy="10" r="0.6" fill="currentColor" />
        </svg>
      );
    case "wow":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={1.75}>
          <circle cx="12" cy="12" r="8" fill={filled ? "currentColor" : "none"} fillOpacity={filled ? 0.18 : 0} />
          <circle cx="12" cy="14.5" r="2" />
          <circle cx="9.5" cy="9.5" r="0.6" fill="currentColor" />
          <circle cx="14.5" cy="9.5" r="0.6" fill="currentColor" />
        </svg>
      );
    case "star":
      return (
        <svg {...common} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.75}>
          <path d="M12 4l2.4 5 5.6.6-4.2 3.8 1.2 5.5L12 16.2 7 18.9l1.2-5.5L4 9.6l5.6-.6z" strokeLinejoin="round" />
        </svg>
      );
  }
}

export function FeedbackBar({
  tripId,
  member,
  members,
  target,
  reactions,
  comments,
  onChanged,
  onToast,
  audience = [],
}: {
  tripId: string;
  member: Member;
  members: Member[];
  target: FeedbackTarget;
  reactions: Reaction[];
  /** Kids get them read-only (RLS, 00050). */
  comments: Comment[];
  onChanged: () => void;
  onToast: (message: string) => void;
  /** the story's groups (00063): comments reach only them, like wall replies */
  audience?: string[];
}) {
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<Comment | null>(null);
  const memberOf = (id: string) => members.find((m) => m.id === id);
  const nameOf = (id: string) => (id === member.id ? strings.wall.me : (memberOf(id)?.display_name ?? ""));

  const { tallies } = tallyReactions(reactions, target, member.id);
  // Names per reaction, not one list of people: someone who gave a heart and
  // a "wow" counted twice in the buttons and once in the names (Hadar
  // 06/11/2026). Three per kind, "ועוד N" opens them all.
  const [allNames, setAllNames] = useState(false);
  const whoByKind = tallies
    .filter((t) => t.count > 0)
    .map((t) => ({
      kind: t.kind,
      ...namesSummary(
        t.memberIds.map((id) =>
          id === member.id ? nameOf(id) : nameWithKidTag(nameOf(id), memberOf(id)?.kid_names)
        ),
        allNames ? Infinity : 3
      ),
    }));
  const mine = comments.filter((c) => matchesTarget(c, target));
  const canComment = member.role === "guest" || member.role === "owner";
  // kids read the comments, without replying (00050)
  const showComments = canComment || mine.length > 0;
  const isOwner = member.role === "owner";
  const key = targetKey(target);
  const inputId = `comment-${key}`;

  // What is new to me (00081). `opened` is the mark as it was when these
  // comments first showed, so a new comment stays marked while I read; the
  // live mark moves on once they have been on screen for a moment.
  const { since, markSeen } = useFeedbackSeen();
  const live = since(key);
  const [opened, setOpened] = useState(live);
  if (opened === null && live !== null) setOpened(live);
  const highlighted = newFeedback(target, comments, reactions, member.id, opened).commentIds;
  const fresh = newFeedback(target, comments, reactions, member.id, live);
  const freshCount = fresh.commentIds.size + fresh.likes;
  const newest = [...mine.map((c) => c.created_at), ...reactions.filter((r) => matchesTarget(r, target)).map((r) => r.created_at)]
    .sort()
    .at(-1);

  const rootRef = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(false);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) =>
        // a long list never shows a quarter of itself on a phone: a third of
        // the screen's height of it counts too
        setOnScreen(entry.intersectionRatio >= 0.25 || entry.intersectionRect.height > window.innerHeight / 3),
      { threshold: [0, 0.25, 0.5] }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!onScreen || freshCount === 0) return;
    const timer = setTimeout(() => markSeen([key], newest), 1500);
    return () => clearTimeout(timer);
  }, [onScreen, freshCount, key, newest, markSeen]);

  async function toggle(kind: ReactionKind, mineId: string | null) {
    if (busy) return;
    setBusy(true);
    try {
      if (mineId) await removeReaction(mineId);
      else await addReaction(tripId, member.id, target, kind);
      onChanged();
    } catch {
      onToast(strings.common.error);
    } finally {
      setBusy(false);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await addComment(tripId, member.id, target, text);
      setDraft("");
      onChanged();
    } catch {
      onToast(strings.common.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} id={`feedback-${key}`} className="scroll-mt-24 space-y-2.5">
      <div className="flex flex-wrap gap-1.5">
        {tallies.map((t) => (
          <button
            key={t.kind}
            type="button"
            onClick={() => void toggle(t.kind, t.mineId)}
            aria-pressed={t.mineId !== null}
            aria-label={`${LABELS[t.kind]}${t.count ? ` (${t.count})` : ""}`}
            className={`flex h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold ${
              t.mineId
                ? "border-sv-clay bg-sv-clay-soft text-sv-clay"
                : "border-sv-line bg-sv-card text-sv-ink-soft"
            }`}
          >
            <ReactionIcon kind={t.kind} filled={t.mineId !== null} />
            {t.count > 0 && <span>{t.count}</span>}
          </button>
        ))}
      </div>
      {whoByKind.length > 0 && (
        <ul className="space-y-1 text-[12px] text-sv-ink-soft">
          {whoByKind.map((w) => (
            <li key={w.kind} className="flex items-start gap-1.5">
              <span className="mt-px shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5" role="img" aria-label={LABELS[w.kind]}>
                <ReactionIcon kind={w.kind} filled={false} />
              </span>
              <span>
                {w.shown}
                {w.more > 0 && (
                  <>
                    {" "}
                    <button
                      type="button"
                      onClick={() => setAllNames(true)}
                      className="font-semibold text-sv-ink underline underline-offset-2"
                    >
                      {strings.feedback.andMoreN.replace("{n}", String(w.more))}
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {showComments && (
        <div className="space-y-2 border-t border-sv-line pt-2.5">
          {mine.length > 0 && (
            <ul className="space-y-2">
              {mine.map((c) => {
                return (
                  <li
                    key={c.id}
                    className={`rounded-2xl bg-sv-paper px-3 py-2 ${highlighted.has(c.id) ? "ring-1 ring-sv-clay" : ""}`}
                  >
                    <p className="text-[12px] font-bold text-sv-ink">
                      {nameOf(c.author_id)}
                      {c.author_id !== member.id && <KidTag names={memberOf(c.author_id)?.kid_names} />}
                      <span className="ms-1.5 font-normal text-sv-ink-soft" dir="ltr">
                        {formatShortDate(c.created_at.slice(0, 10))}
                      </span>
                      {highlighted.has(c.id) && (
                        <span className="ms-1.5 align-middle">
                          <NewDot />
                        </span>
                      )}
                    </p>
                    <p className="whitespace-pre-wrap break-words text-[14px] text-sv-ink">{c.body}</p>
                    {(isOwner || c.author_id === member.id) && (
                      <div className="mt-1 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          aria-label={strings.common.edit}
                          onClick={() => setEditing(c)}
                          className="grid place-items-center rounded-full text-sv-ink-soft"
                        >
                          <EditIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={strings.common.delete}
                          onClick={async () => {
                            if (!(await askConfirm(strings.feedback.deleteConfirm))) return;
                            void deleteComment(c.id).then(onChanged).catch(() => onToast(strings.common.error));
                          }}
                          className="grid place-items-center rounded-full text-sv-ink-soft"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {canComment && (
          <form onSubmit={(e) => void send(e)} className="flex gap-2">
            <label htmlFor={inputId} className="sr-only">
              {strings.feedback.commentLabel}
            </label>
            <input
              id={inputId}
              type="text"
              maxLength={1000}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={strings.feedback.commentPlaceholder}
              className="min-w-0 flex-1 rounded-2xl border border-sv-line bg-sv-card px-3 py-2.5 text-sv-ink placeholder:text-sv-ink-soft focus:border-sv-sage focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="shrink-0 rounded-2xl bg-sea px-4 font-bold text-on-sea disabled:opacity-50"
            >
              {strings.feedback.send}
            </button>
          </form>
          )}
          {audience.length > 0 && member.role !== "kid" && (
            <p className="text-[12px] text-sv-ink-soft">
              {strings.feedback.commentsGoTo.replace("{to}", audience.join(", "))}
            </p>
          )}
          {member.role === "guest" && (
            <p className="text-[12px] text-sv-ink-soft">{strings.feedback.commentsHint}</p>
          )}
        </div>
      )}
      {editing && (
        <EditTextSheet
          initial={editing.body}
          maxLength={1000}
          onClose={() => setEditing(null)}
          onSave={async (text) => {
            await updateComment(editing.id, text);
            setEditing(null);
            onToast(strings.editText.saved);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
