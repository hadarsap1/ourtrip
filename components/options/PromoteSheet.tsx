"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { strings } from "@/lib/strings";
import type { PlaceOption } from "@/lib/types";

const FIELD =
  "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-sea";

/** Turns a shortlisted option into a real booking. The option itself stays in
 *  the bank marked 'הוזמן' - see promoteToBooking in lib/data/placeOptions.ts. */
export function PromoteSheet({
  option,
  onClose,
  onConfirm,
}: {
  option: PlaceOption | null;
  onClose: () => void;
  onConfirm: (fields: {
    startDate: string | null;
    endDate: string | null;
    notes: string | null;
  }) => void | Promise<void>;
}) {
  const s = strings.options;
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Sheet open={option !== null} onClose={onClose} title={s.promoteTitle}>
      {option && (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await onConfirm({
                startDate: startDate || null,
                endDate: endDate || null,
                notes: notes || null,
              });
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="rounded-xl bg-paper-deep p-3">
            <p className="font-semibold">{option.title}</p>
            <p className="mt-1 text-xs text-ink-soft">{s.promoteIntro}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">{s.promoteStart}</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={FIELD}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">{s.promoteEnd}</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={FIELD}
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">{s.promoteNotes}</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={FIELD}
            />
          </label>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-2xl bg-sea py-3 font-semibold text-white disabled:opacity-60"
          >
            {s.promoteConfirm}
          </button>
        </form>
      )}
    </Sheet>
  );
}
