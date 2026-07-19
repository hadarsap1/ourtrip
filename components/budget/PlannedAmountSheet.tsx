"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { updateCategoryPlanned } from "@/lib/data/expenses";
import { strings } from "@/lib/strings";
import type { BudgetCategory } from "@/lib/types";

export function PlannedAmountSheet({
  category,
  onClose,
  onDone,
  onError,
}: {
  category: BudgetCategory | null;
  onClose: () => void;
  onDone: () => void;
  onError: () => void;
}) {
  if (!category) return null;
  return (
    <PlannedForm
      key={category.id}
      category={category}
      onClose={onClose}
      onDone={onDone}
      onError={onError}
    />
  );
}

function PlannedForm({
  category,
  onClose,
  onDone,
  onError,
}: {
  category: BudgetCategory;
  onClose: () => void;
  onDone: () => void;
  onError: () => void;
}) {
  const [amount, setAmount] = useState(
    category.planned_amount > 0 ? String(category.planned_amount) : ""
  );
  const [saving, setSaving] = useState(false);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount || "0");
    if (!Number.isFinite(value) || value < 0 || saving) return;
    setSaving(true);
    updateCategoryPlanned(category.id, value)
      .then(onDone)
      .catch(() => {
        onError();
        setSaving(false);
      });
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`${strings.budget.editPlanned} — ${category.label_he}`}
    >
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label
            htmlFor="planned-amount"
            className="mb-1 block text-sm font-medium text-ink-soft"
          >
            {strings.budget.plannedAmount}
          </label>
          <input
            id="planned-amount"
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-xl border border-line px-3 py-2.5 text-2xl font-bold focus:border-sea focus:outline-none"
            dir="ltr"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-sea py-3 font-semibold text-white hover:bg-sea-deep disabled:opacity-60"
        >
          {strings.common.save}
        </button>
      </form>
    </Sheet>
  );
}
