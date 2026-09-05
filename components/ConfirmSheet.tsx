"use client";

import { useSyncExternalStore } from "react";
import { Sheet } from "@/components/Sheet";
import { strings } from "@/lib/strings";

// A themed replacement for `window.confirm`, which the app used for all twenty
// of its destructive actions. Inside a standalone PWA that native dialog is a
// system sheet: it announces the origin, ignores `dir="rtl"`, and looks
// nothing like the app the family is holding. It also blocks the main thread,
// so a "are you sure" over a slow list froze the screen behind it.
//
// The API stays imperative on purpose - `if (!(await askConfirm(q))) return;`
// is a one-line swap at each call site, and no screen has to grow a provider
// or thread a callback down to the row that owns the delete button.
//
// Module-level store, same shape as lib/useMember.ts: one host is mounted in
// the root layout and every caller talks to it through askConfirm.

type Pending = { question: string; resolve: (ok: boolean) => void } | null;

let pending: Pending = null;
const listeners = new Set<() => void>();

function publish(next: Pending): void {
  pending = next;
  for (const notify of listeners) notify();
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

/**
 * Asks the question and resolves to what the family chose. Cancel, the
 * backdrop and Escape all resolve `false`, so the safe answer is the one you
 * get by dismissing.
 */
export function askConfirm(question: string): Promise<boolean> {
  // A second question while one is open would strand the first promise, so the
  // outstanding one is answered "no" before the new one takes its place.
  pending?.resolve(false);
  return new Promise<boolean>((resolve) => {
    publish({ question, resolve });
  });
}

export function ConfirmHost() {
  const current = useSyncExternalStore(
    subscribe,
    () => pending,
    () => null
  );

  function answer(ok: boolean) {
    current?.resolve(ok);
    publish(null);
  }

  return (
    <Sheet
      open={current !== null}
      onClose={() => answer(false)}
      title={strings.common.confirmTitle}
    >
      <p className="mb-5 text-[15px] leading-relaxed text-ink">
        {current?.question}
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => answer(true)}
          className="min-h-[48px] flex-1 rounded-xl bg-rose-600 px-4 font-bold text-white active:bg-rose-700"
        >
          {strings.common.confirmYes}
        </button>
        <button
          type="button"
          onClick={() => answer(false)}
          className="min-h-[48px] flex-1 rounded-xl border border-line bg-white px-4 font-semibold text-ink-soft active:bg-paper-deep"
        >
          {strings.common.cancel}
        </button>
      </div>
    </Sheet>
  );
}
