"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { strings } from "@/lib/strings";

const UNDO_MS = 5000;

type Pending = { message: string; undo: () => void; commit?: () => void };

/**
 * Delete-with-undo: show(message, undo, commit). `commit` runs when the toast
 * times out without Undo (the hard delete); `undo` restores. One at a time -
 * a new toast commits the previous one first.
 */
export function useUndoToast() {
  const [current, setCurrent] = useState<Pending | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentRef = useRef<Pending | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const show = useCallback((message: string, undo: () => void, commit?: () => void) => {
    clear();
    currentRef.current?.commit?.();
    const next = { message, undo, commit };
    currentRef.current = next;
    setCurrent(next);
    timer.current = setTimeout(() => {
      currentRef.current?.commit?.();
      currentRef.current = null;
      setCurrent(null);
    }, UNDO_MS);
  }, []);

  const onUndo = useCallback(() => {
    clear();
    currentRef.current?.undo();
    currentRef.current = null;
    setCurrent(null);
  }, []);

  // Leaving the screen commits what was pending: undo is only for the moment.
  useEffect(
    () => () => {
      clear();
      currentRef.current?.commit?.();
    },
    []
  );

  const toast = current ? (
    <div role="status" aria-live="polite" className="fixed inset-x-4 bottom-[calc(8.5rem+env(safe-area-inset-bottom))] z-[70] mx-auto flex max-w-md items-center gap-2 rounded-xl bg-ink pe-1 ps-4 text-paper shadow-lg">
      <span className="flex-1 py-3 text-sm">{current.message}</span>
      <button type="button" onClick={onUndo} className="rounded-lg px-3 text-sm font-bold text-sea-tint">
        {strings.ui.undo}
      </button>
    </div>
  ) : null;

  return { show, toast };
}
