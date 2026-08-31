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
      className="relative isolate grid rounded-[13px] bg-paper-deep p-[3px]"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-[3px] -z-10 rounded-[10px] bg-white transition-[inset-inline-start] duration-[180ms] ease-out"
        style={{
          width: `calc(${width}% - 6px)`,
          insetInlineStart: `calc(${index * width}% + 3px)`,
          boxShadow: "0 2px 5px -2px rgba(34,49,46,.2)",
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
            className={`rounded-[10px] py-[7px] text-[12.5px] transition-colors ${
              active ? "font-bold text-sea-deep" : "font-semibold text-ink-soft"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
