"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { updateTripTotalBudget } from "@/lib/data/expenses";
import { strings } from "@/lib/strings";
import type { Trip } from "@/lib/types";

const FIELD =
  "w-full rounded-xl border border-line bg-white px-3 py-2 text-lg font-semibold outline-none focus:border-sea";

/** Sets the overall trip budget. Clearing it is a first-class action, not an
 *  edge case: with no total set the screen goes back to deriving one from the
 *  categories, which is what it always did before. */
export function TotalBudgetSheet({
  trip,
  planned,
  onClose,
  onDone,
  onError,
}: {
  trip: Trip;
  /** Sum of the category planned amounts, so the sheet can say how the target
   *  compares to the plan it is being measured against. */
  planned: number;
  onClose: () => void;
  onDone: () => void;
  onError: () => void;
}) {
  const s = strings.budget;
  const [value, setValue] = useState(
    trip.total_budget != null ? String(trip.total_budget) : ""
  );
  const [busy, setBusy] = useState(false);

  const parsed = Number(value.replace(/,/g, ""));
  const valid = value.trim() === "" || (Number.isFinite(parsed) && parsed >= 0);

  async function submit(total: number | null) {
    setBusy(true);
    try {
      await updateTripTotalBudget(trip.id, total);
      onDone();
    } catch {
      onError();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title={s.editTotalBudget}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          void submit(value.trim() === "" ? null : parsed);
        }}
      >
        <p className="rounded-xl bg-paper-deep p-3 text-xs leading-relaxed text-ink-soft">
          {s.totalBudgetHint}
        </p>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            {s.totalBudgetField}
          </span>
          <input
            autoFocus
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={FIELD}
            dir="ltr"
          />
        </label>

        {!valid && <p className="text-sm text-rose-600">{s.totalBudgetInvalid}</p>}

        <p className="text-xs text-ink-soft">
          {s.totalBudgetAllocated.replace(
            "{n}",
            Math.round(planned).toLocaleString("he-IL")
          )}
        </p>

        <button
          type="submit"
          disabled={busy || !valid}
          className="w-full rounded-2xl bg-sea py-3 font-semibold text-white disabled:opacity-60"
        >
          {s.save}
        </button>

        {trip.total_budget != null && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit(null)}
            className="w-full rounded-2xl border border-line py-2.5 text-sm font-medium text-ink-soft"
          >
            {s.clearTotalBudget}
          </button>
        )}
      </form>
    </Sheet>
  );
}
