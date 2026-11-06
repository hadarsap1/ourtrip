import type { ReactNode } from "react";

export type BannerTone = "info" | "warning" | "danger";

const TONE: Record<BannerTone, string> = {
  info: "border-info/20 bg-info-soft text-info",
  // sun-deep, not --warning: it is the warm text that holds 4.9:1 on the tint
  warning: "border-sun/30 bg-sun-tint text-sun-deep",
  danger: "border-alert/25 bg-alert-tint text-alert",
};

/**
 * One shape for every in-screen notice (visual pass 06/11/2026): the rain
 * alert, "from the device's copy", a missing policy... had grown five shapes -
 * dashed, solid, pill, different radii and type sizes - for the same job.
 * Theme-aware through the tokens; role="status" so it is announced.
 */
export function Banner({
  tone = "warning",
  icon,
  action,
  className = "",
  children,
}: {
  tone?: BannerTone;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      className={`flex items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 text-sm font-medium ${TONE[tone]} ${className}`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
