// Pure helpers for likes and comments (migration 00045).

import type { Reaction, ReactionKind } from "@/lib/types";

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
