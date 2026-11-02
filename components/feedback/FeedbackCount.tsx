"use client";

import { HeartIcon, MessagesIcon } from "@/components/icons";
import { strings } from "@/lib/strings";

const s = strings.feedback;

/** "תגובה אחת, 3 לייקים" - what is new on a target, in words. */
export function newWords(comments: number, likes: number): string {
  const parts: string[] = [];
  if (comments > 0) parts.push(comments === 1 ? s.commentOne : s.commentsN.replace("{n}", String(comments)));
  if (likes > 0) parts.push(likes === 1 ? s.likeOne : s.likesN.replace("{n}", String(likes)));
  return parts.join(", ");
}

/**
 * How many comments and likes a target has, and whether any of it is new to
 * me (00081). On a photo it sits over the picture; in a card's text row it
 * sits inline. Nothing at all when there is nothing.
 */
export function FeedbackCount({
  comments,
  likes,
  isNew,
  overlay = false,
  suffix,
}: {
  comments: number;
  likes: number;
  isNew: boolean;
  overlay?: boolean;
  /** a word after the counts, e.g. "בעדכון" */
  suffix?: string;
}) {
  if (comments === 0 && likes === 0) return null;
  const label = s.countsLabel.replace("{comments}", String(comments)).replace("{likes}", String(likes));
  return (
    <span
      role="img"
      aria-label={isNew ? `${label}, ${s.newTag}` : label}
      className={`inline-flex items-center gap-1.5 rounded-full text-xs font-bold ${
        overlay ? "bg-black/65 px-2 py-1 text-white" : "text-sv-ink-soft"
      }`}
    >
      {comments > 0 && (
        <span className="inline-flex items-center gap-0.5">
          <MessagesIcon className="h-3.5 w-3.5" />
          {comments}
        </span>
      )}
      {likes > 0 && (
        <span className="inline-flex items-center gap-0.5">
          <HeartIcon className="h-3.5 w-3.5" />
          {likes}
        </span>
      )}
      {suffix && <span className="font-semibold">{suffix}</span>}
      {isNew && <NewDot />}
    </span>
  );
}

/** The small "חדש" tag. */
export function NewDot() {
  return (
    <span className="rounded-full bg-sv-clay-fill px-1.5 py-px text-[11px] font-bold leading-4 text-white">
      {s.newTag}
    </span>
  );
}

/**
 * "חדש: 2 תגובות" at the top of a card whose comments are further down; a
 * tap scrolls to them.
 */
export function NewFeedbackChip({
  comments,
  likes,
  scrollTo,
}: {
  comments: number;
  likes: number;
  /** element id of the card's comments */
  scrollTo: string;
}) {
  if (comments === 0 && likes === 0) return null;
  return (
    <button
      type="button"
      onClick={() => document.getElementById(scrollTo)?.scrollIntoView({ behavior: "smooth", block: "center" })}
      className="rounded-full bg-sv-clay-fill px-2.5 py-0.5 text-[12px] font-bold text-white"
    >
      {s.newSummary.replace("{what}", newWords(comments, likes))}
    </button>
  );
}
