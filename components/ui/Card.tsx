import Link from "next/link";
import type { ReactNode } from "react";

export function Card({ children, highlighted = false, dashed = false, className = "" }: { children: ReactNode; highlighted?: boolean; dashed?: boolean; className?: string }) {
  const edge = highlighted ? "border-2 border-green shadow-card" : dashed ? "border-[1.5px] border-dashed border-line bg-transparent" : "border border-line shadow-card";
  return <div className={`rounded-card ${dashed ? "" : "bg-surface"} p-4 ${edge} ${className}`}>{children}</div>;
}

/** Icon tile + label + big count (bookings by type, More grid). */
export function Tile({ href, icon, label, count, toneClass = "bg-sea-tint text-sea" }: { href: string; icon: ReactNode; label: string; count?: number; toneClass?: string }) {
  const empty = count === 0;
  return (
    <Link
      href={href}
      className={`flex min-h-[96px] flex-col gap-2.5 rounded-card p-3 ${empty ? "border border-dashed border-line bg-paper" : "border border-line bg-surface shadow-card"}`}
    >
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${empty ? "bg-paper-deep text-ink-soft" : toneClass}`}>{icon}</span>
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{label}</span>
        {count !== undefined && <span className={`text-2xl font-extrabold tabular-nums ${empty ? "text-ink-soft" : ""}`}><bdi>{count}</bdi></span>}
      </span>
    </Link>
  );
}

/** Row with icon tile, title, sub-line and an optional trailing element. */
export function ListRow({
  href,
  onClick,
  icon,
  toneClass = "bg-sea-tint text-sea",
  title,
  sub,
  subClass = "text-ink-soft",
  trailing,
}: {
  href?: string;
  onClick?: () => void;
  icon?: ReactNode;
  toneClass?: string;
  title: ReactNode;
  sub?: ReactNode;
  subClass?: string;
  trailing?: ReactNode;
}) {
  const inner = (
    <>
      {icon && <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneClass}`}>{icon}</span>}
      <span className="flex min-w-0 flex-1 flex-col text-start">
        <span className="text-sm font-semibold text-ink">{title}</span>
        {sub && <span className={`text-xs ${subClass}`}>{sub}</span>}
      </span>
      {trailing}
    </>
  );
  const cls = "flex min-h-[64px] w-full items-center gap-3 px-4 py-2 active:bg-paper-deep";
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

/** Small illustration slot + one line + exactly one CTA. */
export function EmptyState({ illustration, title, body, action }: { illustration?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border-[1.5px] border-dashed border-line px-6 py-8 text-center">
      {illustration}
      <p className="text-base font-bold text-ink">{title}</p>
      {body && <p className="max-w-xs text-sm text-ink-soft">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/**
 * A redesign tile (קרם חם, "עוד"): white card, a 40px green-soft icon circle
 * and a 17px / 800 label. Optional dot for "something new inside".
 */
export function IconTile({ href, icon, label, badge }: { href: string; icon: ReactNode; label: string; badge?: ReactNode }) {
  return (
    <Link
      href={href}
      className="relative flex min-h-[96px] flex-col justify-between gap-3 rounded-[20px] border border-line bg-surface p-3.5 shadow-card active:bg-paper-deep"
    >
      <span className="grid h-10 w-10 place-items-center rounded-full bg-green-soft text-green [&>svg]:h-[22px] [&>svg]:w-[22px]">{icon}</span>
      <span className="text-[17px] font-extrabold leading-tight text-ink">{label}</span>
      {badge && <span className="absolute end-3 top-3">{badge}</span>}
    </Link>
  );
}
