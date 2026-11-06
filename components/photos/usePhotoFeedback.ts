"use client";

import { useCallback, useEffect, useState } from "react";
import { listComments, listPhotoStories, listReactions, pollFeedback } from "@/lib/data/feedback";
import { feedbackCounts, newFeedback, type FeedbackTarget } from "@/lib/feedback";
import { useFeedbackSeen } from "@/lib/useFeedbackSeen";
import { listMembers } from "@/lib/data/trip";
import type { Comment, Member, Reaction } from "@/lib/types";

function fetchFeedback(tripId: string): Promise<[Reaction[], Comment[]]> {
  return Promise.all([
    listReactions(tripId).catch(() => [] as Reaction[]),
    listComments(tripId).catch(() => [] as Comment[]),
  ]);
}

/**
 * Likes, comments and names for the photos screen (00077). Same rhythm as the
 * stories screen: load on open, then poll while visible - no realtime (see
 * FEEDBACK_REFRESH_MS). RLS decides which rows each role gets.
 *
 * A photo that is in an update gets its comments on the update, not on the
 * photo, so with `withStories` a card also counts what was written on its
 * updates (Hadar 02/11/2026: the photos had comments and the cards showed
 * none).
 */
export type FeedbackBadge = { comments: number; likes: number; isNew: boolean };
export type StoryBadge = FeedbackBadge & { postId: string };

export function usePhotoFeedback(tripId: string | null, withStories = false) {
  const [members, setMembers] = useState<Member[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [photoStories, setPhotoStories] = useState<Map<string, string[]>>(new Map());
  // frozen: opening a photo marks it seen; "חדש" on its tile stays for this visit
  const { memberId, since } = useFeedbackSeen(true);

  const reload = useCallback(async () => {
    if (!tripId) return;
    const [r, c] = await fetchFeedback(tripId);
    setReactions(r);
    setComments(c);
  }, [tripId]);

  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    const load = () =>
      fetchFeedback(tripId).then(([r, c]) => {
        if (cancelled) return;
        setReactions(r);
        setComments(c);
      });
    void listMembers(tripId)
      .then((m) => !cancelled && setMembers(m))
      .catch(() => {});
    if (withStories) {
      void listPhotoStories(tripId)
        .then((m) => !cancelled && setPhotoStories(m))
        .catch(() => {});
    }
    void load();
    const stop = pollFeedback(() => void load());
    return () => {
      cancelled = true;
      stop();
    };
  }, [tripId, withStories]);

  const badgeOf = useCallback(
    (target: FeedbackTarget, id: string): FeedbackBadge => {
      const counts = feedbackCounts(target, comments, reactions);
      const fresh = newFeedback(target, comments, reactions, memberId, since(id));
      return { ...counts, isNew: fresh.commentIds.size + fresh.likes > 0 };
    },
    [comments, reactions, memberId, since]
  );

  /** The photo's own likes and comments, and whether any is new to me. */
  const photoBadge = useCallback((photoId: string) => badgeOf({ photoId }, photoId), [badgeOf]);

  /** What was written on the updates this photo is in, if anything; the link
   *  goes to the update with something new, else the first with anything. */
  const storyBadge = useCallback(
    (photoId: string): StoryBadge | null => {
      const posts = photoStories.get(photoId) ?? [];
      const badges = posts.map((postId) => ({ postId, ...badgeOf({ postId }, postId) }));
      const withAny = badges.filter((b) => b.comments + b.likes > 0);
      if (withAny.length === 0) return null;
      return {
        postId: (withAny.find((b) => b.isNew) ?? withAny[0]).postId,
        comments: withAny.reduce((n, b) => n + b.comments, 0),
        likes: withAny.reduce((n, b) => n + b.likes, 0),
        isNew: withAny.some((b) => b.isNew),
      };
    },
    [photoStories, badgeOf]
  );

  return { members, reactions, comments, reload, photoBadge, storyBadge };
}
