"use client";

import { useState, useSyncExternalStore } from "react";
import { readPreview, stopPreview, type PreviewState } from "@/lib/preview";
import { strings } from "@/lib/strings";

const t = strings.preview;
const noop = () => () => {};
// readPreview parses on every call; the snapshot must be stable between renders
let lastRaw: string | null = null;
let lastState: PreviewState | null = null;
function snapshot(): PreviewState | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem("ot-preview");
  } catch {
    raw = null;
  }
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastState = readPreview();
  }
  return lastState;
}

/** On every screen while a parent views as a guest or a kid (00068), with the way back. */
export function PreviewBanner() {
  const state = useSyncExternalStore(noop, snapshot, () => null);
  const [busy, setBusy] = useState(false);
  if (!state) return null;
  const label =
    state.role === "kid"
      ? t.bannerKid
      : state.labels.length > 0
        ? t.bannerGuestGroups.replace("{groups}", state.labels.join(", "))
        : t.bannerGuest;
  return (
    <div role="status" className="sticky top-0 z-50 flex items-center justify-between gap-2 bg-warning-soft px-4 py-1.5 text-xs font-bold text-ink">
      <span className="min-w-0 truncate">{label}</span>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void stopPreview();
        }}
        className="min-h-[36px] shrink-0 rounded-full bg-sea px-3 text-on-sea disabled:opacity-60"
      >
        {busy ? t.backing : t.back}
      </button>
    </div>
  );
}
