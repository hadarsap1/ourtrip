"use client";

import { useEffect, useState, type ReactNode } from "react";
import { strings } from "@/lib/strings";

export type FabAction = { key: string; label: string; icon: ReactNode; onSelect: () => void; toneClass?: string };

/**
 * Capture FAB (design option A): 56px, centred above the bottom bar. Opens a
 * panel of up to four actions, so any capture is two taps from anywhere.
 * Escape or the scrim closes it.
 */
export function Fab({ actions }: { actions: FabAction[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {open && <button type="button" aria-label={strings.ui.close} data-tap-exempt onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-scrim" />}
      {open && (
        <div role="menu" aria-label={strings.ui.quickAdd} className="fixed inset-x-4 bottom-[calc(9.5rem+env(safe-area-inset-bottom))] z-50 mx-auto grid max-w-md grid-cols-4 gap-2 rounded-3xl bg-surface p-3 shadow-[var(--e3)]">
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                a.onSelect();
              }}
              className="flex flex-col items-center gap-1.5 rounded-xl py-2 text-sm font-semibold text-ink"
            >
              <span className={`flex h-14 w-14 items-center justify-center rounded-2xl ${a.toneClass ?? "bg-sea-tint text-sea"}`}>{a.icon}</span>
              {a.label}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        aria-label={open ? strings.ui.close : strings.ui.quickAdd}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] start-1/2 z-50 flex h-14 w-14 translate-x-1/2 items-center justify-center rounded-full bg-sea text-on-sea shadow-[var(--e2)] lg:hidden"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-7 w-7 motion-safe:transition-transform motion-safe:duration-[350ms] ${open ? "rotate-45" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </>
  );
}
