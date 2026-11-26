"use client";

import { useState, useSyncExternalStore } from "react";
import { SegmentedControl } from "@/components/SegmentedControl";
import { formatMoney } from "@/lib/format";
import { readFxStore } from "@/lib/fxCache";
import { strings } from "@/lib/strings";
import type { Booking, BudgetCategory, Expense, ItineraryDay } from "@/lib/types";
import { BudgetInsights, type PaceInfo } from "./BudgetInsights";

const t = strings.budgetV2;
const ils = (n: number) => formatMoney(Math.round(n), "ILS");
const noop = () => () => {};

function ratesStamp(): string | null {
  const at = readFxStore().updatedAt;
  if (!at) return null;
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Budget v2 (Phase 2.4), behind the budgetV2 flag: "left today" hero with a
 * 14-day sparkline, then categories as rings or the insights (per country,
 * everyday vs specific, cash - DECISIONS #59), and the offline FX stamp. Everything is derived from
 * the same expenses/categories the screen already loaded (cache-first), plus
 * the itinerary days for the country view - so it all renders offline.
 */
export function BudgetV2({
  categories,
  expenses,
  rawExpenses,
  days,
  bookings,
  onPickCategory,
  selectedId,
  pace,
  totalBudget,
}: {
  categories: BudgetCategory[];
  /** Counted: each withdrawal reduced by what was itemized out of it. */
  expenses: Expense[];
  /** As entered, for the insights (they split the cash themselves). */
  rawExpenses: Expense[];
  days: ItineraryDay[];
  bookings: Booking[];
  /** Tapping a category filters the expense list; editing one is in Settings. */
  onPickCategory: (c: BudgetCategory) => void;
  selectedId: string | null;
  /** Pace and projection - moved here from the main screen (17/11/2026). */
  pace: PaceInfo;
  /** The target set in Settings, null when none; shown as one quiet line. */
  totalBudget: number | null;
}) {
  const [tab, setTab] = useState<"categories" | "insights">("categories");
  const stamp = useSyncExternalStore(noop, ratesStamp, () => null);

  const spentTotal = expenses.reduce((sum, e) => sum + e.amount_ils, 0);
  // Everything paid in cash: the withdrawals (what is left of them, i.e. the
  // unitemised cash) plus the purchases marked "paid in cash".
  const cashTotal = expenses
    .filter((e) => e.is_cash_withdrawal || e.paid_in_cash)
    .reduce((sum, e) => sum + e.amount_ils, 0);
  const spentBy = new Map<string, number>();
  for (const e of expenses) spentBy.set(e.category_id, (spentBy.get(e.category_id) ?? 0) + e.amount_ils);

  return (
    <div className="space-y-3">
      {/* hero: one number (what is left), and the two it comes from. The
          14-day sparkline and "today" line went: Sivan could not read the
          screen (17/11/2026), and neither answered a question she asks. */}
      <section className="rounded-card border border-line bg-surface px-4 py-4 shadow-[var(--e1)]">
        {/* What was spent and how much of it in cash (Hadar 24/11/2026). No
            "what is left"; the target only as a quiet line below, and it is
            set in Settings. */}
        <dl className="grid grid-cols-2 gap-3 text-base">
          <div>
            <dt className="text-ink-soft">{t.spentTotal}</dt>
            <dd className="text-xl font-extrabold tabular-nums text-ink">
              <bdi>{ils(spentTotal)}</bdi>
            </dd>
          </div>
          <div>
            <dt className="text-ink-soft">{t.cashTotal}</dt>
            <dd className="text-xl font-extrabold tabular-nums text-ink">
              <bdi>{ils(cashTotal)}</bdi>
            </dd>
          </div>
        </dl>
        {totalBudget != null && totalBudget > 0 && (
          <p className="mt-2.5 border-t border-line pt-2 text-sm text-ink-soft">
            {t.targetLine.split("{amount}")[0]}
            <bdi>{ils(totalBudget)}</bdi>
          </p>
        )}
      </section>

      <SegmentedControl
        ariaLabel={t.tabsLabel}
        value={tab}
        onChange={setTab}
        options={[
          { value: "categories", label: t.tabCategories },
          { value: "insights", label: t.tabInsights },
        ]}
      />

      {tab === "categories" ? (
        <ul className="overflow-hidden rounded-card border border-line bg-surface">
          {categories.map((c) => (
            <li key={c.id} className="border-t border-line first:border-t-0">
              <button
                type="button"
                onClick={() => onPickCategory(c)}
                aria-pressed={selectedId === c.id}
                className={`flex w-full items-baseline justify-between gap-3 px-4 py-3.5 text-start ${selectedId === c.id ? "bg-sea-tint" : ""}`}
              >
                <span className="min-w-0 truncate text-base font-bold text-ink">{c.label_he}</span>
                <span className="shrink-0 text-base font-extrabold tabular-nums text-ink">
                  <bdi>{ils(spentBy.get(c.id) ?? 0)}</bdi>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <BudgetInsights categories={categories} expenses={rawExpenses} days={days} bookings={bookings} pace={pace} />
      )}

      <p className="text-center text-xs text-ink-soft">{stamp ? t.ratesUpdated.replace("{when}", stamp) : t.ratesNever}</p>
    </div>
  );
}
