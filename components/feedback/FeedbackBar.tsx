"use client";

import { useEffect, useRef, useState } from "react";
import { EditIcon, TrashIcon } from "@/components/icons";
import { EditTextSheet } from "@/components/EditTextSheet";
import { KidTag } from "@/components/KidTag";
import { NewDot } from "@/components/feedback/FeedbackCount";
import { LABELS, ReactionIcon } from "@/components/feedback/ReactionIcon";
import { ReactionRow } from "@/components/feedback/ReactionRow";
import { askConfirm } from "@/components/ConfirmSheet";
import {
  addComment,
  addReaction,
  deleteComment,
  removeReaction,
  updateComment,
} from "@/lib/data/feedback";
import {
  commentThreads,
  matchesTarget,
  namesSummary,
  newFeedback,
  tallyReactions,
  targetKey,
  type CommentTarget,
} from "@/lib/feedback";
import { useFeedbackSeen } from "@/lib/useFeedbackSeen";
import { formatShortDate } from "@/lib/format";
import { nameWithKidTag } from "@/lib/kidTag";
import { strings } from "@/lib/strings";
import type { Comment, Member, Reaction, ReactionKind } from "@/lib/types";

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
  target: CommentTarget;
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
  // answering a comment (00102): the comment tapped, shown above the input
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  // threads opened or closed by hand; otherwise a thread opens by itself
  // when it has a reply that is new to me
  const [openThreads, setOpenThreads] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLInputElement>(null);
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
      // a reply to a reply answers the comment at the top of its thread, as
      // the database does anyway (00102)
      const root = replyTo ? (replyTo.reply_to ?? replyTo.id) : null;
      await addComment(tripId, member.id, target, text, root);
      setDraft("");
      if (root) setOpenThreads((open) => ({ ...open, [root]: true }));
      setReplyTo(null);
      onChanged();
    } catch {
      onToast(strings.common.error);
    } finally {
      setBusy(false);
    }
  }

  /** One comment or reply; `replyCount` makes deleting it say its replies go
   *  too (on delete cascade, 00102). */
  const commentItem = (c: Comment, replyCount: number) => (
    <div className={`rounded-[18px] bg-bg px-3.5 py-2.5 ${highlighted.has(c.id) ? "ring-1 ring-coral" : ""}`}>
      <p className="text-sm font-bold text-green">
        {nameOf(c.author_id)}
        {c.author_id !== member.id && <KidTag names={memberOf(c.author_id)?.kid_names} />}
        <span className="ms-2 font-medium text-muted" dir="ltr">
          {formatShortDate(c.created_at.slice(0, 10))}
        </span>
        {highlighted.has(c.id) && (
          <span className="ms-1.5 align-middle">
            <NewDot />
          </span>
        )}
      </p>
      <p className="whitespace-pre-wrap break-words text-base text-ink">{c.body}</p>
      {/* emoji for everyone, kids too (00103); reply, edit, delete at the end */}
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <ReactionRow
          tripId={tripId}
          memberId={member.id}
          target={{ commentId: c.id }}
          reactions={reactions}
          onChanged={onChanged}
          onToast={onToast}
        />
        <div className="ms-auto flex items-center gap-1">
          {canComment && (
            <button
              type="button"
              onClick={() => {
                setReplyTo(c);
                inputRef.current?.focus();
              }}
              className="min-h-10 px-1 text-[15px] font-bold text-green underline underline-offset-2"
            >
              {strings.feedback.reply}
            </button>
          )}
          {(isOwner || c.author_id === member.id) && (
            <>
              <button
                type="button"
                aria-label={strings.common.edit}
                onClick={() => setEditing(c)}
                className="grid h-8 w-8 place-items-center rounded-full text-sv-ink-soft"
              >
                <EditIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={strings.common.delete}
                onClick={async () => {
                  const ask = replyCount > 0 ? strings.feedback.deleteWithRepliesConfirm : strings.feedback.deleteConfirm;
                  if (!(await askConfirm(ask))) return;
                  if (replyTo && (replyTo.id === c.id || replyTo.reply_to === c.id)) setReplyTo(null);
                  void deleteComment(c.id).then(onChanged).catch(() => onToast(strings.common.error));
                }}
                className="grid h-8 w-8 place-items-center rounded-full text-sv-ink-soft"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div ref={rootRef} id={`feedback-${key}`} className="scroll-mt-24 space-y-2.5">
      <div className="flex flex-wrap gap-2">
        {tallies.map((t) => (
          <button
            key={t.kind}
            type="button"
            onClick={() => void toggle(t.kind, t.mineId)}
            aria-pressed={t.mineId !== null}
            aria-label={`${LABELS[t.kind]}${t.count ? ` (${t.count})` : ""}`}
            // 48x44 round pills (קרם חם); mine is coral-soft with a coral
            // border and a filled icon, so the state is never colour alone
            className={`flex h-11 min-w-12 items-center justify-center gap-1.5 rounded-full border-2 px-3 text-base font-bold motion-safe:active:scale-95 [&>svg]:h-[22px] [&>svg]:w-[22px] ${
              t.mineId
                ? "border-coral bg-coral-soft text-coral"
                : "border-line bg-surface text-ink"
            }`}
          >
            <ReactionIcon kind={t.kind} filled={t.mineId !== null} />
            {t.count > 0 && <span className={t.mineId ? "text-coral-ink" : ""}>{t.count}</span>}
          </button>
        ))}
      </div>
      {whoByKind.length > 0 && (
        <ul className="space-y-1 text-xs text-sv-ink-soft">
          {whoByKind.map((w) => (
            <li key={w.kind} className="flex items-start gap-1.5">
              <span className="mt-px shrink-0 [&>svg]:h-4 [&>svg]:w-4" role="img" aria-label={LABELS[w.kind]}>
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
        <div className="space-y-2.5 border-t border-line pt-3">
          {mine.length > 0 && (
            <ul className="space-y-2">
              {commentThreads(mine).map(({ comment, replies }) => {
                const open = openThreads[comment.id] ?? replies.some((r) => highlighted.has(r.id));
                return (
                  <li key={comment.id} className="space-y-1.5">
                    {commentItem(comment, replies.length)}
                    {replies.length > 0 && (
                      <>
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() => setOpenThreads((all) => ({ ...all, [comment.id]: !open }))}
                          className="ms-3 flex min-h-8 items-center gap-1.5 text-xs font-semibold text-sv-ink-soft underline underline-offset-2"
                        >
                          {open
                            ? strings.feedback.hideReplies
                            : replies.length === 1
                              ? strings.feedback.replyOne
                              : strings.feedback.repliesN.replace("{n}", String(replies.length))}
                          {!open && replies.some((r) => highlighted.has(r.id)) && <NewDot />}
                        </button>
                        {open && (
                          <ul className="ms-3 space-y-1.5 border-s-2 border-sv-line ps-3">
                            {replies.map((r) => (
                              <li key={r.id}>{commentItem(r, 0)}</li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {canComment && replyTo && (
            <div className="flex items-start gap-2 rounded-xl bg-sv-paper px-3 py-2 text-xs text-sv-ink-soft">
              <p className="min-w-0 flex-1">
                <span className="font-semibold text-sv-ink">
                  {replyTo.author_id === member.id
                    ? strings.feedback.replyingToMine
                    : strings.feedback.replyingTo.replace("{name}", nameOf(replyTo.author_id))}
                </span>{" "}
                <span className="line-clamp-1">{replyTo.body}</span>
              </p>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="min-h-8 shrink-0 font-semibold text-sea underline"
              >
                {strings.feedback.cancelReply}
              </button>
            </div>
          )}
          {canComment && (
          <form onSubmit={(e) => void send(e)} className="flex items-center gap-2">
            <label htmlFor={inputId} className="sr-only">
              {strings.feedback.commentLabel}
            </label>
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              maxLength={1000}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={replyTo ? strings.feedback.replyPlaceholder : strings.feedback.commentPlaceholder}
              className="min-h-12 min-w-0 flex-1 rounded-full border border-line bg-bg px-4 text-ink placeholder:text-muted focus:border-green focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="min-h-12 shrink-0 rounded-full bg-green px-[18px] text-[15px] font-bold text-on-green disabled:opacity-50"
            >
              {strings.feedback.send}
            </button>
          </form>
          )}
          {audience.length > 0 && member.role !== "kid" && (
            <p className="text-xs text-sv-ink-soft">
              {strings.feedback.commentsGoTo.replace("{to}", audience.join(", "))}
            </p>
          )}
          {member.role === "guest" && (
            <p className="text-[13px] font-medium text-muted">{strings.feedback.commentsHint}</p>
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
