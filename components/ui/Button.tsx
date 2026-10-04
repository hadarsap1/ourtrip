import type { ButtonHTMLAttributes, ReactNode } from "react";

// Design system v2 buttons (docs/design/REDESIGN-HANDOFF.md). 48px tall,
// r-md, label 16/600. The CSS floor in globals.css guarantees 44×44 anyway.

type Variant = "primary" | "secondary" | "ghost" | "destructive";

const VARIANT: Record<Variant, string> = {
  primary: "bg-sea text-on-sea active:bg-sea-deep",
  secondary: "border-[1.5px] border-sea bg-surface text-sea active:bg-sea-tint",
  ghost: "bg-transparent text-sea active:bg-sea-tint",
  destructive: "bg-alert text-on-alert active:opacity-90",
};

export function Button({
  variant = "primary",
  loading = false,
  offline = false,
  icon,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
  /** Needs the network and there is none: stays visible, reads as unavailable. */
  offline?: boolean;
  icon?: ReactNode;
}) {
  const look = offline
    ? "border border-dashed border-line bg-paper-deep text-ink-soft"
    : disabled
      ? "bg-paper-deep text-ink-soft opacity-70"
      : VARIANT[variant];
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold transition-transform active:scale-[.98] motion-reduce:transform-none ${look} ${className}`}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  variant = "outline",
  badge,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Required: icon-only buttons need an accessible name. */
  label: string;
  variant?: "outline" | "ghost" | "filled";
  badge?: number;
}) {
  const look =
    variant === "filled"
      ? "bg-sea text-on-sea"
      : variant === "ghost"
        ? "bg-transparent text-ink"
        : "border border-line bg-surface text-ink";
  return (
    <button
      type="button"
      aria-label={badge ? `${label} (${badge})` : label}
      {...rest}
      className={`relative inline-flex h-11 w-11 items-center justify-center rounded-full ${look} ${className}`}
    >
      {children}
      {badge ? (
        <span
          aria-hidden="true"
          className="absolute -top-1 -end-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-paper bg-alert px-1 text-xs font-bold text-on-alert"
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export function Spinner({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={`animate-spin motion-reduce:animate-none ${className}`} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}
