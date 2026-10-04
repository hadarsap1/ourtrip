import Link from "next/link";
import type { ReactNode } from "react";

export function Card({ children, highlighted = false, dashed = false, className = "" }: { children: ReactNode; highlighted?: boolean; dashed?: boolean; className?: string }) {
  const edge = highlighted ? "border-2 border-sea shadow-card" : dashed ? "border-[1.5px] border-dashed border-line bg-transparent" : "border border-line shadow-card";
  return <div className={`rounded-2xl ${dashed ? "" : "bg-surface"} p-4 ${edge} ${className}`}>{children}</div>;
}

/** Icon tile + label + big count (bookings by type, More grid). */
export function Tile({ href, icon, label, count, toneClass = "bg-sea-tint text-sea" }: { href: string; icon: ReactNode; label: string; count?: number; toneClass?: string }) {
  const empty = count === 0;
  return (
    <Link
      href={href}
      className={`flex min-h-[96px] flex-col gap-2.5 rounded-2xl p-3 ${empty ? "border border-dashed border-line bg-paper" : "border border-line bg-surface"}`}
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
    <div className="flex flex-col items-center gap-2 rounded-2xl border-[1.5px] border-dashed border-line px-6 py-8 text-center">
      {illustration}
      <p className="text-base font-bold text-ink">{title}</p>
      {body && <p className="max-w-xs text-sm text-ink-soft">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
