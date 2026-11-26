"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { strings } from "@/lib/strings";

export type FabAction = { key: string; label: string; icon: ReactNode; onSelect: () => void; toneClass?: string };

/**
 * Capture button. Opens a panel of up to four actions, so any capture is two
 * taps from anywhere. Escape or the scrim closes it.
 *
 * It sits IN the bottom bar (UI pass 15/11/2026), in the slot BottomNav keeps
 * for it. It used to float 56px above the bar, centred: over the map's "ימים"
 * tab, the label of "העלאת מסמך", the itinerary's "כאן" marker - whatever
 * was at the bottom of a screen until it was scrolled. In the bar it covers
 * nothing, so no screen needs room for it or a rule to hide it.
 */
export const NAV_CAPTURE_SLOT_ID = "nav-capture-slot";
const SLOT_CLASS =
  "relative mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-coral text-on-coral shadow-[var(--e2)]";
// only where there is no bottom bar to sit in (it is hidden from lg up, where the side rail takes over)
const FLOATING_CLASS =
  "fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] start-1/2 z-50 flex h-14 w-14 translate-x-1/2 items-center justify-center rounded-full bg-sea text-on-sea shadow-[var(--e2)] lg:hidden";

/** The bar's slot, once it is in the page; null on a screen with no bar. */
function useNavSlot(): HTMLElement | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const find = () => setSlot(document.getElementById(NAV_CAPTURE_SLOT_ID));
    find();
    // the bar mounts and unmounts with the route (login, join pages have none)
    const watch = new MutationObserver(find);
    watch.observe(document.body, { childList: true, subtree: true });
    return () => watch.disconnect();
  }, []);
  return slot;
}

function InBar({ children }: { children: (className: string) => ReactNode }) {
  const slot = useNavSlot();
  return slot ? createPortal(children(SLOT_CLASS), slot) : <>{children(FLOATING_CLASS)}</>;
}

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
        <div role="menu" aria-label={strings.ui.quickAdd} className="fixed inset-x-4 bottom-[calc(7rem+env(safe-area-inset-bottom))] z-50 mx-auto grid max-w-md grid-cols-4 gap-2 rounded-3xl bg-surface p-3 shadow-[var(--e3)]">
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
      <InBar>
        {(className) => (
          <button
            type="button"
            aria-label={open ? strings.ui.close : strings.ui.quickAdd}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className={className}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-7 w-7 motion-safe:transition-transform motion-safe:duration-[350ms] ${open ? "rotate-45" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}
      </InBar>
    </>
  );
}

/**
 * The same button where a screen has one obvious thing to add: one tap opens
 * the phone's file picker, no menu (photos, Hadar 04/11/2026). A label around
 * the input, so iOS opens the picker from the tap itself.
 */
export function FabPicker({
  label,
  accept,
  multiple,
  busy,
  onFiles,
}: {
  label: string;
  accept: string;
  multiple?: boolean;
  busy?: boolean;
  onFiles: (files: File[]) => void;
}) {
  return (
    <InBar>
      {(className) => (
        <label aria-label={busy ? undefined : label} aria-busy={busy} className={`${className} ${busy ? "opacity-70" : "cursor-pointer"}`}>
          <input
            type="file"
            accept={accept}
            multiple={multiple}
            disabled={busy}
            className="sr-only"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length > 0) onFiles(files);
            }}
          />
          {busy ? (
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-on-sea border-t-transparent" aria-label={strings.photos.uploading} />
          ) : (
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          )}
        </label>
      )}
    </InBar>
  );
}
