// Comments and likes → the parents, by a quiet push (00104, DECISIONS #74).
// Pure and Deno/Node neutral so vitest covers it (feedbackPush.test.ts).
//
// One push per parent per run, folded on the device with the ones already
// showing (tag "feedback", public/sw.js): the count adds up and the app icon
// shows it. Nobody is told about their own comment or like.

export type FeedbackItem = {
  id: string;
  kind: "comment" | "reaction";
  authorId: string;
  createdAt: string;
  /** a comment's text; a like's emoji kind */
  body?: string | null;
  reaction?: string | null;
  postId?: string | null;
  episodeId?: string | null;
  photoId?: string | null;
  commentId?: string | null;
  messageId?: string | null;
};

export type FeedbackPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  many: string;
  count: number;
  silent: true;
  badge: true;
  manyUrl: string;
};

export const FEEDBACK_TAG = "feedback";

const EMOJI: Record<string, string> = { heart: "❤️", smile: "😊", wow: "😮", star: "⭐" };

/** Where a tap on a single comment or like opens. Feedback on a comment opens
 *  the comment's own target when it is known, else home ("מחכה לך"). */
export function feedbackUrl(item: FeedbackItem, commentTargets?: Map<string, FeedbackItem>): string {
  if (item.postId) return `/stories#story-${item.postId}`;
  if (item.episodeId) return `/podcast#episode-${item.episodeId}`;
  if (item.photoId) return `/photos?photo=${item.photoId}`;
  if (item.messageId) return "/messages";
  if (item.commentId) {
    const parent = commentTargets?.get(item.commentId);
    return parent && !parent.commentId ? feedbackUrl(parent) : "/";
  }
  return "/";
}

function onWhat(item: FeedbackItem): string {
  if (item.postId) return "על העדכון";
  if (item.episodeId) return "על הפרק";
  if (item.photoId) return "על התמונה";
  if (item.commentId) return "על התגובה";
  if (item.messageId) return "על ההודעה בצ'אט";
  return "";
}

function preview(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 80 ? `${t.slice(0, 80)}…` : t;
}

/** The push one parent gets for these new items, or null if none is theirs to hear. */
export function feedbackPayloadFor(
  ownerId: string,
  items: FeedbackItem[],
  names: Map<string, string>,
  commentTargets?: Map<string, FeedbackItem>
): FeedbackPayload | null {
  const mine = items
    .filter((i) => i.authorId !== ownerId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (mine.length === 0) return null;
  const latest = mine[mine.length - 1];
  const who = names.get(latest.authorId) ?? "";
  const line =
    latest.kind === "comment"
      ? `${who ? `${who}: ` : ""}${preview(latest.body ?? "")}`
      : [who, EMOJI[latest.reaction ?? ""] ?? "❤️", onWhat(latest)].filter(Boolean).join(" ");
  const many = "{n} תגובות ולייקים חדשים 💬";
  const n = mine.length;
  const comments = mine.filter((i) => i.kind === "comment").length;
  const title =
    n === 1
      ? latest.kind === "comment"
        ? "תגובה חדשה 💬"
        : "לייק חדש ❤️"
      : comments === n
        ? `${n} תגובות חדשות 💬`
        : comments === 0
          ? `${n} לייקים חדשים ❤️`
          : many.replace("{n}", String(n));
  return {
    title,
    body: line,
    url: n === 1 ? feedbackUrl(latest, commentTargets) : "/",
    tag: FEEDBACK_TAG,
    many,
    count: n,
    silent: true,
    badge: true,
    manyUrl: "/",
  };
}
