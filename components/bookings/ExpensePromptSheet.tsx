"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { createExpenseForBooking } from "@/lib/data/expenses";
import { formatMoney } from "@/lib/format";
import { strings } from "@/lib/strings";
import type { Booking, BookingType, BudgetCategory } from "@/lib/types";

// Sensible default budget category per booking type (user can change it).
const DEFAULT_CATEGORY: Record<BookingType, string> = {
  flight: "flights",
  hotel: "lodging",
  train: "transport",
  car_rental: "transport",
  attraction: "attractions",
  other: "misc",
};

export function ExpensePromptSheet({
  open,
  booking,
  categories,
  onClose,
  onResult,
}: {
  open: boolean;
  booking: Booking | null;
  categories: BudgetCategory[];
  onClose: () => void;
  onResult: (message: string) => void;
}) {
  if (!open || !booking) return null;
  // key remounts the prompt per booking, so the default category re-resolves
  return (
    <ExpensePrompt
      key={booking.id}
      booking={booking}
      categories={categories}
      onClose={onClose}
      onResult={onResult}
    />
  );
}

function ExpensePrompt({
  booking,
  categories,
  onClose,
  onResult,
}: {
  booking: Booking;
  categories: BudgetCategory[];
  onClose: () => void;
  onResult: (message: string) => void;
}) {
  const [categoryId, setCategoryId] = useState(() => {
    const preferred = categories.find(
      (c) => c.key === DEFAULT_CATEGORY[booking.type]
    );
    return preferred?.id ?? categories[0]?.id ?? "";
  });
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!booking || !categoryId || saving) return;
    setSaving(true);
    try {
      await createExpenseForBooking(booking, categoryId);
      onResult(strings.bookings.expenseCreated);
    } catch (e) {
      onResult(
        e instanceof Error && e.message === "fx"
          ? strings.bookings.expenseFxError
          : strings.common.error
      );
    }
  }

  return (
    <Sheet open onClose={onClose} title={strings.bookings.expensePromptTitle}>
      <div className="space-y-4">
        <p className="text-sm text-ink-soft">
          {strings.bookings.expensePromptBody}
          {booking.cost != null && (
            <span className="mr-1 font-semibold text-ink" dir="ltr">
              {formatMoney(booking.cost, booking.currency ?? "ILS")}
            </span>
          )}
        </p>

        <div>
          <label
            htmlFor="expense-category"
            className="mb-1 block text-sm font-medium text-ink-soft"
          >
            {strings.bookings.expenseCategory}
          </label>
          <select
            id="expense-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded-xl border border-line px-3 py-2.5 text-base focus:border-sea focus:outline-none"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label_he}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={saving || !categoryId}
            className="flex-1 rounded-xl bg-sea py-3 font-semibold text-white hover:bg-sea-deep disabled:opacity-60"
          >
            {strings.bookings.expenseCreate}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-line px-4 py-3 font-semibold text-ink-soft hover:bg-paper-deep"
          >
            {strings.bookings.expenseSkip}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
