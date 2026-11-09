"use client";

import { useEffect, useSyncExternalStore } from "react";
import { listViews } from "@/lib/data/views";
import type { ContentView } from "@/lib/types";

/**
 * Parents: every guest view of the trip (00085), for the "who saw it" chips.
 * One module-level store for all the chips on a screen: one query when the
 * first chip mounts, again when the app comes back into view and about once a
 * minute while it is visible. No realtime on purpose (00081 notes: realtime
 * traffic is the scarce thing). If it cannot be read, the chips show nothing.
 */

type State = { tripId: string | null; views: ContentView[]; loaded: boolean };

const EMPTY: State = { tripId: null, views: [], loaded: false };
let state: State = EMPTY;
let loadingFor: string | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let users = 0;
const listeners = new Set<() => void>();

const REFRESH_MS = 60_000;

function publish(next: State): void {
  state = next;
  for (const notify of listeners) notify();
}

function load(tripId: string): void {
  if (loadingFor === tripId) return;
  loadingFor = tripId;
  void listViews(tripId)
    .then((views) => {
      if (loadingFor === tripId) publish({ tripId, views, loaded: true });
    })
    .catch(() => {})
    .finally(() => {
      if (loadingFor === tripId) loadingFor = null;
    });
}

function onVisible(): void {
  if (document.visibilityState === "visible" && state.tripId) load(state.tripId);
}

function start(tripId: string): () => void {
  users++;
  if (state.tripId !== tripId) publish({ ...EMPTY, tripId });
  if (!state.loaded) load(tripId);
  if (users === 1) {
    document.addEventListener("visibilitychange", onVisible);
    timer = setInterval(() => {
      if (document.visibilityState === "visible" && state.tripId) load(state.tripId);
    }, REFRESH_MS);
  }
  return () => {
    users--;
    if (users === 0) {
      document.removeEventListener("visibilitychange", onVisible);
      if (timer) clearInterval(timer);
      timer = null;
      // the next screen asks again rather than showing an old count
      publish({ ...state, loaded: false });
    }
  };
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

/** null `tripId` (not a parent) loads nothing. */
export function useContentViews(tripId: string | null): ContentView[] | null {
  useEffect(() => {
    if (!tripId) return;
    return start(tripId);
  }, [tripId]);
  const snap = useSyncExternalStore(subscribe, () => state, () => EMPTY);
  return tripId && snap.tripId === tripId && snap.loaded ? snap.views : null;
}
