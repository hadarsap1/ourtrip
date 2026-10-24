"use client";

import { strings } from "@/lib/strings";

const MAX = 3;

/** Up to three kids' names, one input each (00067). Blank inputs are fine:
 *  the caller normalizes before saving. */
export function KidNamesField({
  id,
  value,
  onChange,
  showHint = true,
}: {
  id: string;
  value: string[];
  onChange: (value: string[]) => void;
  showHint?: boolean;
}) {
  const rows = value.length === 0 ? [""] : value;
  const set = (i: number, next: string) => onChange(rows.map((v, j) => (j === i ? next : v)));
  return (
    <div>
      <label htmlFor={`${id}-0`} className="mb-1 block text-sm font-medium text-ink-soft">
        {strings.kidTag.field}
      </label>
      {showHint && <p className="mb-2 text-xs text-ink-soft">{strings.kidTag.fieldHint}</p>}
      <div className="space-y-2">
        {rows.map((name, i) => (
          <div key={i} className="flex gap-2">
            <input
              id={`${id}-${i}`}
              type="text"
              maxLength={40}
              value={name}
              onChange={(e) => set(i, e.target.value)}
              placeholder={strings.kidTag.placeholder}
              aria-label={i === 0 ? undefined : strings.kidTag.placeholder}
              className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-base focus:border-sea focus:outline-none"
            />
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
                aria-label={strings.kidTag.remove.replace("{name}", name || strings.kidTag.placeholder)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line text-ink-soft"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      {rows.length < MAX && rows[rows.length - 1].trim() !== "" && (
        <button
          type="button"
          onClick={() => onChange([...rows, ""])}
          className="mt-2 text-sm font-semibold text-sea"
        >
          {strings.kidTag.add}
        </button>
      )}
    </div>
  );
}
