"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { listFeedbackStamps, type FeedbackStamp } from "@/lib/data/feedback";
import { newFeedbackByKind, NO_NEW_FEEDBACK, type NewFeedbackByKind } from "@/lib/feedback";
import { useFeedbackSeen } from "@/lib/useFeedbackSeen";

/**
 * A parent's "new like or comment" per kind - updates, photos, episodes - for
 * the tiles on "עוד" and the dot on its tab (Hadar 04/11/2026). Uses the same
 * seen marks as the cards (00081), so opening a card clears it here too,
 * without a reload.
 *
 * One module-level store for the tab and the screen. The likes and comments
 * reload on navigation and when the app comes back into view, at most every
 * 20 s - they are not realtime anywhere (see pollFeedback).
 */

const MIN_GAP_MS = 20_000;

let stamps: FeedbackStamp[] = [];
let loadedFor: string | null = null;
let lastLoad = 0;
let inFlight = false;
const listeners = new Set<() => void>();

function load(tripId: string, memberId: string, force = false): void {
  const key = `${tripId}:${memberId}`;
  if (inFlight) return;
  if (!force && loadedFor === key && Date.now() - lastLoad < MIN_GAP_MS) return;
  inFlight = true;
  void listFeedbackStamps(tripId, memberId)
    .then((next) => {
      stamps = next;
      loadedFor = key;
      lastLoad = Date.now();
      for (const notify of listeners) notify();
    })
    .catch(() => {})
    .finally(() => {
      inFlight = false;
    });
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

/** tripId null = not a parent: nothing is loaded and nothing is new. */
export function useNewFeedback(tripId: string | null, refreshKey?: string): NewFeedbackByKind {
  const { memberId, since } = useFeedbackSeen();

  useEffect(() => {
    if (!tripId || !memberId) return;
    load(tripId, memberId);
    const onVisible = () => {
      if (document.visibilityState === "visible") load(tripId, memberId);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [tripId, memberId, refreshKey]);

  const snap = useSyncExternalStore(subscribe, () => stamps, () => stamps);
  const mine = tripId && memberId && loadedFor === `${tripId}:${memberId}`;
  return useMemo(
    () => (mine ? newFeedbackByKind(snap, since) : NO_NEW_FEEDBACK),
    [mine, snap, since]
  );
}
