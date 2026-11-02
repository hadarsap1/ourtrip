"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { listSeen, markSeen as saveSeen } from "@/lib/data/feedback";
import { newBaseline } from "@/lib/feedback";
import { useMember } from "@/lib/useMember";

/**
 * When I last looked at each story's, episode's and photo's likes and
 * comments (00081), so a card can say what is new. In-app only, no push
 * (Hadar 02/11/2026).
 *
 * One module-level store for every card on the screen (like useUnreadWall):
 * one query when the app opens, again when it comes back into view (another
 * device may have marked things), and a mark is shown at once and saved in
 * the background. If the table cannot be read, nothing is ever "new" - the
 * counts still show.
 */

type State = {
  memberId: string | null;
  seen: Map<string, string>;
  /** "a week ago", for a target with no mark; null until the marks load */
  baseline: string | null;
};

const EMPTY: State = { memberId: null, seen: new Map(), baseline: null };
let state: State = EMPTY;
let loadingFor: string | null = null;
let watchingVisibility = false;
const listeners = new Set<() => void>();

function publish(next: State): void {
  state = next;
  for (const notify of listeners) notify();
}

function later(a: string | undefined, b: string): string {
  return a && Date.parse(a) > Date.parse(b) ? a : b;
}

function load(memberId: string, force = false): void {
  if (loadingFor === memberId) return;
  if (!force && state.memberId === memberId && state.baseline) return;
  loadingFor = memberId;
  void listSeen()
    .then((remote) => {
      if (loadingFor !== memberId) return;
      // a mark made here while the list was on its way is not lost
      const seen = new Map(remote);
      if (state.memberId === memberId) {
        for (const [key, at] of state.seen) seen.set(key, later(seen.get(key), at));
      }
      publish({ memberId, seen, baseline: newBaseline(Date.now()) });
    })
    .catch(() => {})
    .finally(() => {
      if (loadingFor === memberId) loadingFor = null;
    });
}

function watchVisibility(): void {
  if (watchingVisibility || typeof document === "undefined") return;
  watchingVisibility = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.memberId) load(state.memberId, true);
  });
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

/** Marks targets as seen. `upTo` is the newest feedback time on them: the
 *  mark is never earlier, so a phone clock running behind the server does
 *  not bring the same comment back as new. */
function mark(targetIds: string[], upTo?: string): void {
  const { memberId, baseline } = state;
  if (!memberId || !baseline || targetIds.length === 0) return;
  const now = new Date().toISOString();
  const at = upTo ? later(upTo, now) : now;
  const seen = new Map(state.seen);
  for (const id of targetIds) seen.set(id, later(seen.get(id), at));
  publish({ ...state, seen });
  void saveSeen(memberId, targetIds, at).catch(() => {});
}

export function useFeedbackSeen() {
  const { member } = useMember();
  const memberId = member?.id ?? null;

  useEffect(() => {
    if (!memberId) return;
    watchVisibility();
    load(memberId);
  }, [memberId]);

  const snap = useSyncExternalStore(subscribe, () => state, () => EMPTY);
  const ready = memberId !== null && snap.memberId === memberId && snap.baseline !== null;

  /** Since when feedback on this target is new to me; null while unknown. */
  const since = useCallback(
    (targetId: string): string | null => (ready ? (snap.seen.get(targetId) ?? snap.baseline) : null),
    [ready, snap]
  );

  return { memberId, since, markSeen: mark };
}
