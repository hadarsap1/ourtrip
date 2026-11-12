// A new update that was not saved yet, kept on this device (Sivan 12/11/2026:
// she wrote an update, added photos and closed the app before saving - the
// text was gone and the photos were left in the feed with no update).
//
// Photos upload the moment they are picked, so only their ids are kept here;
// the text lives only in this device's storage until the update is saved.
// Nothing here is a security boundary: the draft is the author's own words on
// the author's own device, and the photos stay behind RLS like any other.

import type { PostVisibility } from "@/lib/types";

export type StoryDraft = {
  title: string;
  body: string;
  mood: string | null;
  place: string;
  photoIds: string[];
  audience: PostVisibility;
  groups: string[];
  savedAt: string;
};

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function store(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function key(tripId: string, memberId: string): string {
  return `ourtrip-story-draft:${tripId}:${memberId}`;
}

/** Whether there is anything worth keeping. */
export function draftHasContent(d: Pick<StoryDraft, "title" | "body" | "photoIds">): boolean {
  return d.title.trim() !== "" || d.body.trim() !== "" || d.photoIds.length > 0;
}

export function loadStoryDraft(tripId: string, memberId: string, s: Store | null = store()): StoryDraft | null {
  if (!s) return null;
  try {
    const raw = s.getItem(key(tripId, memberId));
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<StoryDraft>;
    const draft: StoryDraft = {
      title: typeof d.title === "string" ? d.title : "",
      body: typeof d.body === "string" ? d.body : "",
      mood: typeof d.mood === "string" ? d.mood : null,
      place: typeof d.place === "string" ? d.place : "",
      photoIds: Array.isArray(d.photoIds) ? d.photoIds.filter((x): x is string => typeof x === "string") : [],
      audience: d.audience === "guests" || d.audience === "public" ? d.audience : "family",
      groups: Array.isArray(d.groups) ? d.groups.filter((x): x is string => typeof x === "string") : [],
      savedAt: typeof d.savedAt === "string" ? d.savedAt : "",
    };
    return draftHasContent(draft) ? draft : null;
  } catch {
    return null;
  }
}

/** Saves the draft, or clears it when nothing is left in it. */
export function saveStoryDraft(
  tripId: string,
  memberId: string,
  draft: Omit<StoryDraft, "savedAt">,
  s: Store | null = store()
): void {
  if (!s) return;
  try {
    if (!draftHasContent(draft)) {
      s.removeItem(key(tripId, memberId));
      return;
    }
    s.setItem(key(tripId, memberId), JSON.stringify({ ...draft, savedAt: new Date().toISOString() }));
  } catch {
    // storage full or blocked: the composer still works, without the safety net
  }
}

export function clearStoryDraft(tripId: string, memberId: string, s: Store | null = store()): void {
  try {
    s?.removeItem(key(tripId, memberId));
  } catch {
    // nothing to do
  }
}
