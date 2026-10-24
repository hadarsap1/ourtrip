"use client";

import { useSyncExternalStore } from "react";
import { forgetCurrentMember, getCurrentMember } from "@/lib/data/trip";
import type { Member } from "@/lib/types";

/** Current member row (cached module-side). Role gates are cosmetic -
 *  real access control is RLS. */

// BottomNav plus whichever screen is mounted both call this. With per-hook
// state each mount re-ran the fetch chain and re-rendered on its own; a single
// module-level store resolves once and updates every consumer together.
//
// `memberFailed` separates "resolved, and there is nobody" (really signed out)
// from "could not ask" (offline, or the request failed). Both leave `member`
// null, and telling the family the wrong one of the two sends them to a login
// screen when all they needed was to wait for a signal.
type Snapshot = {
  member: Member | null;
  memberLoading: boolean;
  memberFailed: boolean;
};

const INITIAL: Snapshot = {
  member: null,
  memberLoading: true,
  memberFailed: false,
};

let snapshot: Snapshot = INITIAL;
let started = false;
const listeners = new Set<() => void>();

function publish(next: Snapshot): void {
  snapshot = next;
  for (const notify of listeners) notify();
}

// A lookup that was overtaken by a newer one must not publish its answer.
let generation = 0;

function resolve(): void {
  started = true;
  const mine = ++generation;
  void getCurrentMember()
    .then((member) => {
      if (mine === generation) publish({ member, memberLoading: false, memberFailed: false });
    })
    .catch(() => {
      if (mine === generation) publish({ member: null, memberLoading: false, memberFailed: true });
    });
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  if (!started) resolve();
  return () => {
    listeners.delete(notify);
  };
}

/**
 * Ask again after signing in without a page load. The kid PIN unlock mints a
 * session in place; the store had already resolved "nobody" before it, so the
 * tablet showed a member-less app (no kid home) until a reload.
 */
export function refreshMember(): void {
  publish(INITIAL);
  resolve();
}

/**
 * AuthGate just linked this login to its member row. The store may have asked
 * "who am I?" before the link existed: on a guest's first open after a parent
 * approved them it got "nobody", and the home screen fell through to the
 * parents' dashboard (QA 17/10). Ask again unless it already knows the role.
 */
export function memberLinked(role: string): void {
  if (snapshot.member?.role === role) return;
  forgetCurrentMember();
  refreshMember();
}

/** The member's own row was just changed (a guest's kids' names, 00067):
 *  read it again quietly, without the loading state refreshMember shows. */
export function memberChanged(): void {
  forgetCurrentMember();
  resolve();
}

export function useMember(): Snapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => INITIAL // prerender: nothing is known about the member yet
  );
}
