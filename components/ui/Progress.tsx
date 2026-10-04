import type { ReactNode } from "react";
import { strings } from "@/lib/strings";

/** 8px bar; fills from the inline-start (right in RTL). */
export function ProgressBar({ value, max = 100, colorClass = "bg-sea", label }: { value: number; max?: number; colorClass?: string; label?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label} className="h-2 overflow-hidden rounded-full bg-paper-deep">
      <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Ring 40/64/72/88; clockwise from 12 o'clock in RTL too (time-like, not text). */
export function Ring({
  value,
  max = 100,
  size = 64,
  stroke = 7,
  colorVar = "var(--brand)",
  trackVar = "var(--surface-2)",
  label,
  children,
}: {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  colorVar?: string;
  trackVar?: string;
  label?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <span role="img" aria-label={label ?? strings.ui.percent.replace("{n}", String(Math.round(frac * 100)))} className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackVar} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colorVar}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * frac} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {children && <span className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</span>}
    </span>
  );
}

/** − value + with 44px buttons. */
export function Stepper({
  value,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  onChange,
  label,
  unit,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
  label: string;
  unit?: string;
}) {
  const btn = "inline-flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface text-ink disabled:opacity-40";
  return (
    <span role="group" aria-label={label} className="inline-flex items-center gap-2">
      <button type="button" className={btn} aria-label={strings.ui.decrease.replace("{what}", label)} disabled={value <= min} onClick={() => onChange(value - 1)}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M5 12h14" /></svg>
      </button>
      <span aria-live="polite" className="min-w-8 text-center text-xl font-extrabold tabular-nums">
        <bdi>{value}</bdi>
        {unit && <span className="block text-xs font-medium text-ink-soft">{unit}</span>}
      </span>
      <button type="button" className={btn} aria-label={strings.ui.increase.replace("{what}", label)} disabled={value >= max} onClick={() => onChange(value + 1)}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </button>
    </span>
  );
}
