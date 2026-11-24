import type { ReactNode } from "react";

/**
 * A redesigned screen's title (קרם חם, 24/11/2026): a 36px Rubik 800 h1, an
 * optional muted subtitle under it, and an optional element on the inline end
 * (a pill button, the SOS button, an avatar).
 */
export function PageHeader({
  title,
  subtitle,
  end,
  className = "",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  end?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`flex items-center justify-between gap-3 ${className}`}>
      <div className="min-w-0 flex-1">
        <h1 className="ot-h1">{title}</h1>
        {subtitle && <div className="mt-1 text-[15px] font-medium leading-snug text-muted">{subtitle}</div>}
      </div>
      {end && <div className="shrink-0">{end}</div>}
    </header>
  );
}
