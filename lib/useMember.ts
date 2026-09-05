"use client";

import { useSyncExternalStore } from "react";
import { getCurrentMember } from "@/lib/data/trip";
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

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  if (!started) {
    started = true;
    void getCurrentMember()
      .then((member) =>
        publish({ member, memberLoading: false, memberFailed: false })
      )
      .catch(() =>
        publish({ member: null, memberLoading: false, memberFailed: true })
      );
  }
  return () => {
    listeners.delete(notify);
  };
}

export function useMember(): Snapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => INITIAL // prerender: nothing is known about the member yet
  );
}
