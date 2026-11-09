// Who of the guests saw an update, opened a photo or played an episode
// (00085). Pure helpers, shared by the guest's recorder, the offline outbox
// and the parents' "who saw it" list.

import type { ContentView, Member } from "@/lib/types";

export type ViewTarget = { postId: string } | { photoId: string } | { episodeId: string };

/** One view waiting to be sent, keyed per target so repeats merge. */
export type PendingView = {
  key: string;
  target: ViewTarget;
  heardSeconds: number;
  /** when it was seen on this device */
  at: string;
};

export function viewKey(target: ViewTarget): string {
  if ("postId" in target) return `post:${target.postId}`;
  if ("photoId" in target) return `photo:${target.photoId}`;
  return `episode:${target.episodeId}`;
}

/** Two views of the same target are one: the furthest heard, the latest time. */
export function mergePendingView(prev: PendingView | undefined, next: PendingView): PendingView {
  if (!prev) return next;
  return {
    ...next,
    heardSeconds: Math.max(prev.heardSeconds, next.heardSeconds),
    at: Date.parse(prev.at) > Date.parse(next.at) ? prev.at : next.at,
  };
}

/**
 * The furthest point reached by listening. A step of up to 3 seconds since
 * the last position is playback; a bigger step (or a step back) is a seek, so
 * jumping to the end does not count as having heard it.
 */
export type HeardState = { last: number | null; heard: number };

export const MAX_PLAYBACK_STEP_S = 3;

export function advanceHeard(state: HeardState, position: number): HeardState {
  if (!Number.isFinite(position) || position < 0) return state;
  const step = state.last === null ? null : position - state.last;
  const playing = step !== null ? step >= 0 && step <= MAX_PLAYBACK_STEP_S : position <= MAX_PLAYBACK_STEP_S;
  return { last: position, heard: playing ? Math.max(state.heard, position) : state.heard };
}

/** A seek moves the position without hearing anything. */
export function seekHeard(state: HeardState, position: number): HeardState {
  return Number.isFinite(position) ? { ...state, last: position } : state;
}

export type Viewer = { member: Member; view: ContentView };

/** The views of one target, by real guests only (test guests and anyone no
 *  longer a guest are left out), latest first. */
export function viewersOf(views: ContentView[], target: ViewTarget, members: Member[]): Viewer[] {
  const byId = new Map(members.map((m) => [m.id, m]));
  const matches = (v: ContentView) =>
    "postId" in target
      ? v.post_id === target.postId
      : "photoId" in target
        ? v.photo_id === target.photoId
        : v.episode_id === target.episodeId;
  const out: Viewer[] = [];
  for (const view of views) {
    if (!matches(view)) continue;
    const member = byId.get(view.member_id);
    if (!member || member.role !== "guest" || member.is_preview) continue;
    out.push({ member, view });
  }
  return out.sort((a, b) => Date.parse(b.view.last_viewed_at) - Date.parse(a.view.last_viewed_at));
}

/** 754 → "12:34", 3725 → "1:02:05". */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** Whole percent of the episode heard, or null when its length is unknown. */
export function heardPercent(heard: number, duration: number | null | undefined): number | null {
  if (!duration || duration <= 0) return null;
  return Math.min(100, Math.round((heard / duration) * 100));
}
