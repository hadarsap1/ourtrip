"use client";

/**
 * One row of mutually exclusive views. The white pill slides between segments
 * rather than cutting, which makes it read as one control moving instead of
 * three buttons flickering.
 *
 * The indicator is positioned with `inset-inline-start`, not `transform`, so it
 * moves the correct way under RTL without the component having to know which
 * direction the document runs in.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );
  const width = 100 / options.length;

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="relative isolate grid rounded-2xl bg-track p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-1 -z-10 rounded-xl bg-surface transition-[inset-inline-start] duration-[180ms] ease-out"
        style={{
          width: `calc(${width}% - 8px)`,
          insetInlineStart: `calc(${index * width}% + 4px)`,
          boxShadow: "0 2px 8px rgba(43,33,24,.12)",
        }}
      />
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={`min-h-[44px] rounded-xl px-1 py-2 text-base leading-tight transition-colors ${
              active ? "font-bold text-ink" : "font-medium text-nav-idle"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
