"use client";

import { useRef, useState, type ReactNode } from "react";

export type SwipeAction = { key: string; label: string; icon: ReactNode; toneClass: string; onSelect: () => void };

const REVEAL_PX = 72; // per action
const OPEN_AT = 72; // past this, snap open

/** Where the row settles after a drag. Pure for tests. `dx` ≤ 0 (toward the end in RTL). */
export function settleSwipe(dx: number, width: number): "closed" | "open" | "commit" {
  const pull = -dx;
  if (width > 0 && pull > width * 0.5) return "commit";
  if (pull > OPEN_AT) return "open";
  return "closed";
}

/**
 * A row you can swipe toward its end edge (left in RTL) to reveal actions
 * (72px each); past half its width it commits `onFullSwipe` (delete, with the
 * screen's Undo toast). The actions are real buttons in the DOM: focusing one
 * opens the row, so keyboard and screen-reader users reach them without a
 * swipe. Reduced motion: no slide animation.
 */
export function SwipeRow({
  actions,
  onFullSwipe,
  children,
  className = "",
}: {
  actions: SwipeAction[];
  onFullSwipe?: () => void;
  children: ReactNode;
  className?: string;
}) {
  const actionsWidth = actions.length * REVEAL_PX;
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; base: number; locked: "x" | "y" | null } | null>(null);
  const moved = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // `offset` is logical: ≤ 0, how far the row has moved toward its END edge.
  // In RTL the end edge is on the left, so physical x and logical agree there.
  const rtl = typeof document === "undefined" || document.documentElement.dir === "rtl";

  const close = () => setOffset(0);

  return (
    <div ref={rootRef} className={`relative overflow-hidden ${className}`}>
      <div className="absolute inset-y-0 start-0 flex" aria-hidden={offset === 0 ? undefined : false}>
        {actions.map((a) => (
          <button
            key={a.key}
            type="button"
            onFocus={() => setOffset(-actionsWidth)}
            onClick={() => {
              close();
              a.onSelect();
            }}
            className={`flex w-[72px] flex-col items-center justify-center gap-0.5 text-[12px] font-bold ${a.toneClass}`}
          >
            {a.icon}
            {a.label}
          </button>
        ))}
      </div>
      <div
        className={`relative select-none bg-surface ${dragging ? "" : "motion-safe:transition-transform motion-safe:duration-[250ms]"}`}
        style={{ transform: `translateX(${rtl ? offset : -offset}px)`, touchAction: "pan-y" }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("[data-swipe-ignore]")) return;
          start.current = { x: e.clientX, y: e.clientY, base: offset, locked: null };
          moved.current = false;
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s) return;
          const dx = rtl ? e.clientX - s.x : s.x - e.clientX; // < 0 = toward the end edge
          const dy = e.clientY - s.y;
          if (!s.locked) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            s.locked = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
            if (s.locked === "x") {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              setDragging(true);
            }
          }
          if (s.locked !== "x") return;
          moved.current = true;
          const width = rootRef.current?.clientWidth ?? 0;
          setOffset(Math.max(-width, Math.min(0, s.base + dx)));
        }}
        onPointerUp={() => {
          const s = start.current;
          start.current = null;
          setDragging(false);
          if (!s || s.locked !== "x") return;
          const result = settleSwipe(offset, rootRef.current?.clientWidth ?? 0);
          if (result === "commit" && onFullSwipe) {
            close();
            onFullSwipe();
          } else setOffset(result === "open" ? -actionsWidth : 0);
        }}
        onPointerCancel={() => {
          start.current = null;
          setDragging(false);
          close();
        }}
        onClickCapture={(e) => {
          // A swipe is not a tap on whatever was under the finger.
          if (moved.current) {
            // The click that ends a swipe: swallow it, keep the row as it settled.
            e.stopPropagation();
            e.preventDefault();
            moved.current = false;
          } else if (offset !== 0) {
            // A real tap on an open row closes it instead of opening the item.
            e.stopPropagation();
            e.preventDefault();
            close();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
