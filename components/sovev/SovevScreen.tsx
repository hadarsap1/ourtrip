import type { ReactNode } from "react";
import { sovevFont } from "@/components/sovev/font";
import { strings } from "@/lib/strings";

/** Parchment ground + the brand font variable for one screen. */
export function SovevScreen({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`sovev ${sovevFont.variable} min-h-full ${className}`}>
      {children}
    </div>
  );
}

/**
 * The badge (the family on the path, from the invitation) and the wordmark.
 * The hyphen in "סו-בב" is the family's name and stays (13/10).
 */
export function SovevBrand({
  size = "md",
  subtitle,
}: {
  size?: "sm" | "md" | "lg";
  subtitle?: string;
}) {
  const badge = size === "lg" ? 72 : size === "md" ? 48 : 32;
  const word =
    size === "lg" ? "text-[40px] leading-[48px]" : size === "md" ? "text-[26px] leading-[34px]" : "text-[20px] leading-[28px]";
  return (
    <div className="flex items-center gap-3">
      {/* decorative: the wordmark beside it carries the name */}
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny static asset; next/image adds nothing here */}
      <img
        src="/sovev/badge.jpg"
        alt=""
        width={badge}
        height={badge}
        className="shrink-0 rounded-full border-2 border-sv-ink object-cover"
        style={{ width: badge, height: badge }}
      />
      <div className="min-w-0">
        <p className={`sovev-display font-extrabold text-sv-ink ${word}`}>{strings.sovev.name}</p>
        {subtitle && <p className="sovev-display text-[14px] font-medium leading-5 text-sv-ink-soft">{subtitle}</p>}
      </div>
    </div>
  );
}
