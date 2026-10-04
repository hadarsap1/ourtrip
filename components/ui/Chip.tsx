import type { ButtonHTMLAttributes, ReactNode } from "react";
import { findCountry } from "@/lib/countries";
import { strings } from "@/lib/strings";

// Chips and tags (design system v2). Visual height 32-36px; the global floor
// gives interactive chips a 44px box.

export function Chip({
  selected = false,
  count,
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; count?: number }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      {...rest}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold ${
        selected ? "border border-sea bg-sea-tint text-sea-deep" : "border border-line bg-surface text-ink"
      } ${className}`}
    >
      {children}
      {count !== undefined && (
        <span className={`min-w-5 rounded-full px-1 text-center text-xs font-bold ${count === 0 ? "bg-alert text-on-alert" : "bg-paper-deep text-ink"}`}>
          {count}
        </span>
      )}
    </button>
  );
}

type Tone = "success" | "warning" | "danger" | "info" | "neutral";
const TONE: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  neutral: "bg-paper-deep text-ink-soft",
};

/** Status tag: 24px, caption 600. Never the only signal - always has text. */
export function Badge({ tone = "neutral", icon, children }: { tone?: Tone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold ${TONE[tone]}`}>
      {icon}
      {children}
    </span>
  );
}

// Literal class strings so Tailwind keeps them (it scans source text).
const COUNTRY_SOFT: Record<string, string> = {
  VN: "bg-vn/10", KH: "bg-kh/10", LA: "bg-la/10", TH: "bg-th/10", PH: "bg-ph/10", JP: "bg-jp/10", GE: "bg-ge/10",
};

/** Flag + Hebrew name + code: color is never the only signal (design rule). */
export function CountryChip({ code, solid = false }: { code: string; solid?: boolean }) {
  const c = findCountry(code);
  const soft = COUNTRY_SOFT[code.toUpperCase()] ?? "bg-paper-deep";
  return (
    <span className={`inline-flex h-8 items-center gap-1.5 rounded-full pe-2.5 ps-1.5 text-sm font-semibold ${solid ? "bg-sea text-on-sea" : `${soft} text-ink`}`}>
      <span aria-hidden="true" className="text-base leading-none">{c?.flag}</span>
      {c?.he ?? code}
      <bdi className="text-xs opacity-80">{code.toUpperCase()}</bdi>
    </span>
  );
}

/** "בעוד 27 ימים": solid danger within 30 days, soft beyond (handoff rule). */
export function CountdownChip({ days }: { days: number }) {
  if (days < 0) return null;
  const urgent = days <= 30;
  const label = days === 0 ? strings.ui.today : days === 1 ? strings.ui.tomorrow : strings.ui.inDays.replace("{n}", String(days));
  return (
    <span className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-bold ${urgent ? "bg-alert text-on-alert" : "bg-alert-tint text-alert"}`}>
      {label}
    </span>
  );
}
