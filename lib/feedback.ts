// Pure helpers for likes and comments (migration 00045).

import type { Comment, Reaction, ReactionKind } from "@/lib/types";

export const REACTION_KINDS: ReactionKind[] = ["heart", "smile", "wow", "star"];

export type FeedbackTarget = { postId: string } | { episodeId: string } | { photoId: string };

export function matchesTarget(
  row: { post_id: string | null; episode_id: string | null; photo_id: string | null },
  target: FeedbackTarget
): boolean {
  if ("postId" in target) return row.post_id === target.postId;
  if ("episodeId" in target) return row.episode_id === target.episodeId;
  return row.photo_id === target.photoId;
}

/** A stable id for the target, for element ids. */
export function targetKey(target: FeedbackTarget): string {
  if ("postId" in target) return target.postId;
  if ("episodeId" in target) return target.episodeId;
  return target.photoId;
}

export type ReactionTally = {
  kind: ReactionKind;
  count: number;
  /** My own like of this kind, so tapping again removes it. */
  mineId: string | null;
  /** who gave this kind, in the order they did - one person can give two
   *  kinds, so a single list of people came out shorter than the count */
  memberIds: string[];
};

export function tallyReactions(reactions: Reaction[], target: FeedbackTarget, memberId: string | null): {
  tallies: ReactionTally[];
  memberIds: string[];
} {
  const mine = reactions.filter((r) => matchesTarget(r, target));
  const tallies = REACTION_KINDS.map((kind) => {
    const ofKind = mine.filter((r) => r.kind === kind);
    return {
      kind,
      count: ofKind.length,
      mineId: ofKind.find((r) => r.member_id === memberId)?.id ?? null,
      memberIds: ofKind.map((r) => r.member_id),
    };
  });
  // each person once, in the order they first reacted
  const memberIds = [...new Set(mine.map((r) => r.member_id))];
  return { tallies, memberIds };
}

/** "סבתא, דנה" + how many more, for "סבתא, דנה ועוד 3". */
export function namesSummary(names: string[], max = 3): { shown: string; more: number } {
  const clean = names.filter(Boolean);
  return { shown: clean.slice(0, max).join(", "), more: Math.max(0, clean.length - max) };
}

// ---------- what is new to me (00081) ----------

/** With no seen mark for a target, feedback from the last week counts as new,
 *  so the first day of the feature does not flag the whole trip. */
export const NEW_FEEDBACK_DAYS = 7;

export function newBaseline(now: number): string {
  return new Date(now - NEW_FEEDBACK_DAYS * 86_400_000).toISOString();
}

export type NewFeedback = {
  /** ids of comments by someone else written after `since` */
  commentIds: Set<string>;
  /** likes by someone else given after `since` */
  likes: number;
};

/** What on `target` is new to `memberId` since `since`. A null `since` means
 *  "not known yet" (the seen marks are still loading): nothing is new. */
export function newFeedback(
  target: FeedbackTarget,
  comments: Comment[],
  reactions: Reaction[],
  memberId: string | null,
  since: string | null
): NewFeedback {
  if (since === null) return { commentIds: new Set(), likes: 0 };
  const after = Date.parse(since);
  const fresh = (at: string) => Date.parse(at) > after;
  return {
    commentIds: new Set(
      comments
        .filter((c) => matchesTarget(c, target) && c.author_id !== memberId && fresh(c.created_at))
        .map((c) => c.id)
    ),
    likes: reactions.filter((r) => matchesTarget(r, target) && r.member_id !== memberId && fresh(r.created_at))
      .length,
  };
}

/** How many comments and likes a target has, for the count on a card. */
export function feedbackCounts(
  target: FeedbackTarget,
  comments: Comment[],
  reactions: Reaction[]
): { comments: number; likes: number } {
  return {
    comments: comments.filter((c) => matchesTarget(c, target)).length,
    likes: reactions.filter((r) => matchesTarget(r, target)).length,
  };
}

export type NewFeedbackByKind = { stories: number; photos: number; episodes: number };

export const NO_NEW_FEEDBACK: NewFeedbackByKind = { stories: 0, photos: 0, episodes: 0 };

/** How many updates, photos and episodes have a like or comment from someone
 *  else that is new to me. `stamps` are already someone else's; `since` is
 *  useFeedbackSeen's (null = not known yet, which counts as nothing new). */
export function newFeedbackByKind(
  stamps: { post_id: string | null; episode_id: string | null; photo_id: string | null; created_at: string }[],
  since: (targetId: string) => string | null
): NewFeedbackByKind {
  const stories = new Set<string>();
  const photos = new Set<string>();
  const episodes = new Set<string>();
  for (const s of stamps) {
    const id = s.post_id ?? s.photo_id ?? s.episode_id;
    if (!id) continue;
    const from = since(id);
    if (from === null || Date.parse(s.created_at) <= Date.parse(from)) continue;
    if (s.post_id) stories.add(id);
    else if (s.photo_id) photos.add(id);
    else episodes.add(id);
  }
  return { stories: stories.size, photos: photos.size, episodes: episodes.size };
}
