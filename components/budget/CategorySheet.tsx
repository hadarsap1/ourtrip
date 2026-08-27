"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import {
  createCategory,
  deleteCategory,
  renameCategory,
  updateCategoryPlanned,
} from "@/lib/data/expenses";
import { strings } from "@/lib/strings";
import type { BudgetCategory } from "@/lib/types";

const FIELD =
  "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-sea";

/** Add, rename, re-budget or remove a category. Categories used to come only
 *  from the seed file, so one it did not anticipate could not be created at
 *  all — this is the whole reason the sheet exists rather than just the
 *  planned-amount editor it replaces. */
export function CategorySheet({
  tripId,
  category,
  onClose,
  onDone,
  onError,
}: {
  tripId: string;
  /** null → creating a new category. */
  category: BudgetCategory | null;
  onClose: () => void;
  onDone: () => void;
  onError: (message?: string) => void;
}) {
  const s = strings.budget;
  const [label, setLabel] = useState(category?.label_he ?? "");
  const [planned, setPlanned] = useState(
    category && category.planned_amount > 0 ? String(category.planned_amount) : ""
  );
  const [busy, setBusy] = useState(false);

  const parsed = Number(planned.replace(/,/g, ""));
  const plannedValid =
    planned.trim() === "" || (Number.isFinite(parsed) && parsed >= 0);
  const amount = planned.trim() === "" ? 0 : parsed;
  const canSave = label.trim() !== "" && plannedValid;

  async function save() {
    setBusy(true);
    try {
      if (category) {
        // Two independent writes; the label may be unchanged, and re-sending it
        // is cheaper than diffing.
        await renameCategory(category.id, label);
        await updateCategoryPlanned(category.id, amount);
      } else {
        await createCategory(tripId, label, amount);
      }
      onDone();
    } catch {
      onError();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!category) return;
    if (!confirm(s.deleteCategoryConfirm)) return;
    setBusy(true);
    try {
      await deleteCategory(category.id);
      onDone();
    } catch (e) {
      // A category with expenses on it is refused by the FK. Say why, rather
      // than a generic failure — and never by quietly deleting the expenses.
      const message = e instanceof Error ? e.message : "";
      onError(message === "category_in_use" ? s.categoryInUse : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={category ? s.editCategory : s.addCategory}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) void save();
        }}
      >
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{s.categoryName}</span>
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className={FIELD}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            {s.plannedAmount}
          </span>
          <input
            inputMode="decimal"
            value={planned}
            onChange={(e) => setPlanned(e.target.value)}
            className={FIELD}
            dir="ltr"
          />
        </label>

        {!plannedValid && (
          <p className="text-sm text-rose-600">{s.totalBudgetInvalid}</p>
        )}

        <button
          type="submit"
          disabled={busy || !canSave}
          className="w-full rounded-2xl bg-sea py-3 font-semibold text-white disabled:opacity-60"
        >
          {s.save}
        </button>

        {category && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="w-full rounded-2xl border border-rose-200 py-2.5 text-sm font-medium text-rose-600"
          >
            {s.deleteCategory}
          </button>
        )}
      </form>
    </Sheet>
  );
}
