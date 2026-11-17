"use client";

import { Sheet } from "@/components/Sheet";
import { formatMoney, formatShortDate } from "@/lib/format";
import { strings } from "@/lib/strings";
import type { BudgetCategory, Expense } from "@/lib/types";

const s = strings.budget;

/**
 * Tapping a category on the budget screen: every expense in it, newest first.
 * `total` is the counted figure (what the category shows on the screen); the
 * rows show what was entered, like the recent-expenses list. Editing the
 * category itself lives in Settings.
 */
export function CategoryExpensesSheet({
  category,
  expenses,
  total,
  onClose,
  onOpenExpense,
}: {
  category: BudgetCategory;
  /** The expenses of this category, as entered. */
  expenses: Expense[];
  total: number;
  onClose: () => void;
  onOpenExpense: (expense: Expense) => void;
}) {
  const rows = [...expenses].sort((a, b) =>
    a.spent_on < b.spent_on ? 1 : a.spent_on > b.spent_on ? -1 : 0
  );
  return (
    <Sheet open onClose={onClose} title={category.label_he}>
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-3 rounded-xl bg-paper-deep px-4 py-3">
          <span className="text-base text-ink-soft">
            {s.categoryExpensesCount.replace("{n}", String(rows.length))}
          </span>
          <span className="text-xl font-extrabold tabular-nums text-ink">
            <bdi>{formatMoney(Math.round(total), "ILS")}</bdi>
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="py-4 text-center text-base text-ink-soft">{s.categoryNoExpenses}</p>
        ) : (
          <ul className="overflow-hidden rounded-card border border-line bg-surface">
            {rows.map((e) => (
              <li key={e.id} className="border-t border-line first:border-t-0">
                <button
                  type="button"
                  onClick={() => onOpenExpense(e)}
                  className="flex w-full items-baseline justify-between gap-3 px-4 py-3 text-start"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-base font-medium text-ink">
                      {e.description || category.label_he}
                    </span>
                    <span className="block text-sm text-ink-soft" dir="ltr">
                      {formatShortDate(e.spent_on)}
                    </span>
                  </span>
                  <span className="shrink-0 text-end">
                    <span className="block text-base font-bold tabular-nums text-ink">
                      <bdi>{formatMoney(Math.round(e.amount_ils), "ILS")}</bdi>
                    </span>
                    {e.currency !== "ILS" && (
                      <span className="block text-sm text-ink-soft">
                        <bdi>{formatMoney(e.amount, e.currency)}</bdi>
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
