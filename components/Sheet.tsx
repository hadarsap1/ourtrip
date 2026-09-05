"use client";

import { useEffect, useId, useRef } from "react";
import { strings } from "@/lib/strings";

// Mobile-first bottom sheet used by all Sprint 2 forms and pickers.
//
// It declares `aria-modal="true"`, so it has to behave like one. Measured on
// the running app (QA 2026-09-05) it did not: Escape left the sheet open, Tab
// walked straight out of it and into the page behind (after 3 stops on
// /checklists), and the page behind kept scrolling under the overlay. On a
// phone the last one is what you actually feel - a flick meant for a long
// sheet drags the screen underneath instead.

/** Everything that can take focus inside the sheet, in DOM order. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Two sheets can be open at once (ItineraryScreen hands a saved booking on to
// the expense prompt). Only the last one opened owns Escape and the scroll
// lock, so one Escape closes one sheet and the page stays frozen until the
// last of them is gone.
const stack: symbol[] = [];

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // onClose is read from a ref so the key/scroll effect below does not tear
  // down and re-run every time the parent re-renders with a new closure.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    // Whoever opened the sheet gets focus back when it closes, so a keyboard
    // user is not dumped at the top of the document.
    const opener = document.activeElement as HTMLElement | null;
    const id = Symbol("sheet");
    stack.push(id);
    const isTop = () => stack[stack.length - 1] === id;

    // Escape closes, and Tab cycles inside the sheet instead of leaving it.
    function onKeyDown(event: KeyboardEvent) {
      if (!isTop()) return;
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const stops = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (stops.length === 0) return;

      const first = stops[0];
      const last = stops[stops.length - 1];
      const active = document.activeElement;

      // Focus that has already escaped (or never arrived) is pulled back in.
      if (!active || !dialog.contains(active)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      }
    }

    // Scroll lock. The sheet has its own overflow-y, so only the page behind
    // is frozen; the scroll position is restored on close because setting
    // overflow:hidden on <body> otherwise jumps a long page back to the top.
    const previousOverflow = stack.length === 1 ? document.body.style.overflow : null;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      const at = stack.indexOf(id);
      if (at !== -1) stack.splice(at, 1);
      if (stack.length === 0) document.body.style.overflow = previousOverflow ?? "";
      opener?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-2xl bg-white p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-bold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={strings.common.close}
            className="rounded-full p-1.5 text-ink-soft hover:bg-paper-deep"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
