"use client";

import { CheckIcon } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { strings } from "@/lib/strings";
import type { VisaRequirement, VisaStatus } from "@/lib/types";

const ORDER: VisaStatus[] = ["todo", "submitted", "approved", "not_needed"];

/**
 * Picks the status of one requirement. A sheet rather than a button that
 * cycles: with four values a cycle makes "back one" cost three taps, and the
 * label only tells you where you are, never where a tap will take you.
 */
export function VisaStatusSheet({
  row,
  onPick,
  onClose,
}: {
  row: VisaRequirement | null;
  onPick: (status: VisaStatus) => void;
  onClose: () => void;
}) {
  const s = strings.visas;
  return (
    <Sheet open={row !== null} onClose={onClose} title={s.statusSheetTitle}>
      {row && (
        <>
          <p className="mb-3 text-sm text-ink-soft">{row.title_he}</p>
          <ul className="space-y-2">
            {ORDER.map((status) => {
              const current = row.status === status;
              return (
                <li key={status}>
                  <button
                    type="button"
                    onClick={() => onPick(status)}
                    aria-current={current}
                    className={`flex min-h-11 w-full items-center justify-between rounded-xl border px-3 py-2.5 text-start text-sm font-medium ${
                      current
                        ? "border-sea bg-sea-tint text-sea-deep"
                        : "border-line bg-white text-ink active:bg-paper-deep"
                    }`}
                  >
                    {s.statuses[status]}
                    {current && <CheckIcon className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Sheet>
  );
}
