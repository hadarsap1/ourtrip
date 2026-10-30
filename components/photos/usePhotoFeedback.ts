"use client";

import { useCallback, useEffect, useState } from "react";
import { listComments, listReactions, pollFeedback } from "@/lib/data/feedback";
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
 */
export function usePhotoFeedback(tripId: string | null) {
  const [members, setMembers] = useState<Member[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);

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
    void load();
    const stop = pollFeedback(() => void load());
    return () => {
      cancelled = true;
      stop();
    };
  }, [tripId]);

  const commentCount = useCallback(
    (photoId: string) => comments.filter((c) => c.photo_id === photoId).length,
    [comments]
  );

  return { members, reactions, comments, reload, commentCount };
}
