"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { strings } from "@/lib/strings";

export type Snap = "peek" | "half" | "full";
const ORDER: Snap[] = ["peek", "half", "full"];
const PEEK_PX = 96;
const FULL_GAP_PX = 48;
const FLING = 0.5; // px/ms, moves exactly one snap

/** Visible height of the sheet for a snap, given the container height. */
export function snapHeight(snap: Snap, containerH: number): number {
  if (snap === "peek") return Math.min(PEEK_PX, containerH);
  if (snap === "half") return Math.round(containerH / 2);
  return Math.max(0, containerH - FULL_GAP_PX);
}

/** Nearest snap after a drag, or one step on a fling. Pure for tests. */
export function settleSnap(current: Snap, visibleH: number, containerH: number, velocity: number): Snap {
  const i = ORDER.indexOf(current);
  if (velocity < -FLING) return ORDER[Math.min(ORDER.length - 1, i + 1)]; // up
  if (velocity > FLING) return ORDER[Math.max(0, i - 1)]; // down
  let best: Snap = current;
  let bestD = Infinity;
  for (const s of ORDER) {
    const d = Math.abs(snapHeight(s, containerH) - visibleH);
    if (d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

/**
 * Non-modal sheet with three snap points (peek / half / full), for content
 * over a map. Must sit inside a `relative` container whose height it uses.
 * Drag the grabber, or tap it to cycle. The scrim shows only at full.
 */
export function BottomSheet({
  snap: controlled,
  onSnapChange,
  defaultSnap = "half",
  label,
  children,
}: {
  snap?: Snap;
  onSnapChange?: (s: Snap) => void;
  defaultSnap?: Snap;
  label: string;
  children: ReactNode;
}) {
  const [own, setOwn] = useState<Snap>(defaultSnap);
  const snap = controlled ?? own;
  const setSnap = (s: Snap) => {
    if (!controlled) setOwn(s);
    onSnapChange?.(s);
  };
  const rootRef = useRef<HTMLDivElement>(null);
  const [containerH, setContainerH] = useState(0);
  const [dragH, setDragH] = useState<number | null>(null);
  const drag = useRef<{ startY: number; startH: number; lastY: number; lastT: number; v: number } | null>(null);

  useEffect(() => {
    const parent = rootRef.current?.parentElement;
    if (!parent) return;
    const ro = new ResizeObserver(() => setContainerH(parent.clientHeight));
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  const height = dragH ?? snapHeight(snap, containerH);

  return (
    <>
      {snap === "full" && dragH === null && (
        <button type="button" aria-label={strings.ui.collapse} data-tap-exempt onClick={() => setSnap("half")} className="absolute inset-0 z-10 bg-scrim" />
      )}
      <section
        ref={rootRef}
        aria-label={label}
        className="absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-3xl bg-surface shadow-[var(--e3)] motion-safe:transition-[height] motion-safe:duration-[250ms]"
        style={{ height, transitionTimingFunction: "var(--ease-out)", transitionProperty: dragH === null ? undefined : "none" }}
      >
        <button
          type="button"
          aria-label={strings.ui.sheetHandle}
          aria-expanded={snap !== "peek"}
          className="flex h-11 w-full shrink-0 touch-none items-center justify-center"
          onClick={() => setSnap(ORDER[(ORDER.indexOf(snap) + 1) % ORDER.length])}
          onPointerDown={(e) => {
            (e.target as Element).setPointerCapture(e.pointerId);
            drag.current = { startY: e.clientY, startH: height, lastY: e.clientY, lastT: e.timeStamp, v: 0 };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const dt = e.timeStamp - d.lastT || 1;
            d.v = (e.clientY - d.lastY) / dt;
            d.lastY = e.clientY;
            d.lastT = e.timeStamp;
            if (Math.abs(e.clientY - d.startY) > 4) setDragH(Math.max(PEEK_PX / 2, Math.min(containerH, d.startH - (e.clientY - d.startY))));
          }}
          onPointerUp={() => {
            const d = drag.current;
            drag.current = null;
            if (dragH === null || !d) return;
            setSnap(settleSnap(snap, dragH, containerH, d.v));
            setDragH(null);
          }}
        >
          <span aria-hidden="true" className="h-1 w-8 rounded-full bg-line" />
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </section>
    </>
  );
}
