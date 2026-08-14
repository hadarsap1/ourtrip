"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Toast } from "@/components/Toast";
import { getActiveTrip } from "@/lib/data/trip";
import { listCategories, listExpenses } from "@/lib/data/expenses";
import { formatMoney, formatShortDate, todayISO } from "@/lib/format";
import { strings } from "@/lib/strings";
import type { BudgetCategory, Expense, Trip } from "@/lib/types";
import { ConverterCard } from "./ConverterCard";
import { ExpenseFormSheet } from "./ExpenseFormSheet";
import { PlannedAmountSheet } from "./PlannedAmountSheet";
import { QuickLinesSheet } from "./QuickLinesSheet";

function daysBetween(fromISO: string, toISO: string): number {
  return Math.floor(
    (new Date(`${toISO}T12:00:00`).getTime() -
      new Date(`${fromISO}T12:00:00`).getTime()) /
      86_400_000
  );
}

export function BudgetScreen() {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const [expenseForm, setExpenseForm] = useState<{ expense: Expense | null } | null>(null);
  const [plannedFor, setPlannedFor] = useState<BudgetCategory | null>(null);
  const [quickLines, setQuickLines] = useState(false);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const refresh = useCallback(async (tripId: string) => {
    const [cats, exps] = await Promise.all([
      listCategories(tripId),
      listExpenses(tripId),
    ]);
    setCategories(cats);
    setExpenses(exps);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const activeTrip = await getActiveTrip();
      if (cancelled || !activeTrip) {
        setLoading(false);
        return;
      }
      setTrip(activeTrip);
      try {
        await refresh(activeTrip.id);
      } catch {
        if (!cancelled) showToast(strings.common.error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, showToast]);

  const refreshNow = useCallback(() => {
    if (!trip) return;
    void refresh(trip.id).catch(() => showToast(strings.common.error));
  }, [trip, refresh, showToast]);

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-8">
        <p className="text-center text-ink-soft">{strings.common.loading}</p>
      </div>
    );
  }

  // ---------- dashboard math ----------
  const spent = expenses.reduce((sum, e) => sum + e.amount_ils, 0);
  const planned = categories.reduce((sum, c) => sum + c.planned_amount, 0);
  const spentByCategory = new Map<string, number>();
  for (const e of expenses) {
    spentByCategory.set(
      e.category_id,
      (spentByCategory.get(e.category_id) ?? 0) + e.amount_ils
    );
  }

  // Spending done BEFORE departure (vaccinations, visas, gear, flights bought
  // in advance) is real budget but not a daily pace — averaging it into the
  // burn rate once the trip starts would wildly inflate both burn and
  // projection. So it is tracked separately and excluded from the pace math,
  // while still counting toward the totals.
  const preTripSpent = trip?.start_date
    ? expenses
        .filter((e) => e.spent_on < trip.start_date!)
        .reduce((sum, e) => sum + e.amount_ils, 0)
    : 0;
  const onTripSpent = spent - preTripSpent;

  // Burn/projection (ROADMAP: projection = spent + daily burn × remaining
  // days). Before the trip starts daily burn is meaningless → projection
  // degrades to "spent so far".
  const today = todayISO();
  let burnPerDay: number | null = null;
  let projection: number | null = null;
  let notStarted = false;
  if (trip?.start_date && trip.end_date) {
    const totalDays = daysBetween(trip.start_date, trip.end_date) + 1;
    if (today < trip.start_date) {
      notStarted = true;
      projection = spent;
    } else {
      const elapsed = Math.min(daysBetween(trip.start_date, today) + 1, totalDays);
      const remaining = Math.max(totalDays - elapsed, 0);
      burnPerDay = onTripSpent / elapsed;
      // pre-trip spending is already sunk: add it once, don't project it
      projection = preTripSpent + onTripSpent + burnPerDay * remaining;
    }
  }

  const categoryLabel = (id: string) =>
    categories.find((c) => c.id === id)?.label_he ?? "";

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      {/* totals */}
      <section className="rounded-2xl border border-line bg-white p-4 shadow-sm">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-ink-soft">{strings.budget.totalSpent}</span>
          <span className="text-sm text-ink-soft">{strings.budget.totalPlanned}</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span className="text-2xl font-bold text-ink" dir="ltr">
            {formatMoney(Math.round(spent), "ILS")}
          </span>
          <span className="text-lg font-semibold text-ink-soft" dir="ltr">
            {formatMoney(Math.round(planned), "ILS")}
          </span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-paper-deep">
          <div
            className={`h-full rounded-full ${
              planned > 0 && spent > planned ? "bg-rose-500" : "bg-sea"
            }`}
            style={{
              width: `${planned > 0 ? Math.min((spent / planned) * 100, 100) : 0}%`,
            }}
          />
        </div>
        {(burnPerDay !== null || projection !== null) && (
          <div className="mt-3 flex justify-between border-t border-line pt-3 text-sm">
            <span className="text-ink-soft">
              {strings.budget.burnRate}{" "}
              <span className="font-semibold text-ink" dir="ltr">
                {notStarted || burnPerDay === null
                  ? "—"
                  : formatMoney(Math.round(burnPerDay), "ILS")}
              </span>
              {!notStarted && burnPerDay !== null && (
                <span className="text-xs text-ink-soft"> {strings.budget.perDay}</span>
              )}
            </span>
            <span className="text-ink-soft">
              {strings.budget.projection}{" "}
              <span className="font-semibold text-ink" dir="ltr">
                {projection === null ? "—" : formatMoney(Math.round(projection), "ILS")}
              </span>
            </span>
          </div>
        )}
        {notStarted && (
          <p className="mt-1 text-xs text-ink-soft">{strings.budget.tripNotStarted}</p>
        )}
        {preTripSpent > 0 && (
          <p className="mt-1 flex items-baseline justify-between text-xs text-ink-soft">
            <span>
              {strings.budget.beforeTrip}{" "}
              <span className="font-semibold text-ink" dir="ltr">
                {formatMoney(Math.round(preTripSpent), "ILS")}
              </span>
            </span>
            {!notStarted && <span>{strings.budget.beforeTripHint}</span>}
          </p>
        )}
      </section>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setExpenseForm({ expense: null })}
          className="rounded-2xl bg-sea py-3 font-semibold text-white shadow hover:bg-sea-deep"
        >
          {strings.budget.addExpense}
        </button>
        <button
          type="button"
          onClick={() => setQuickLines(true)}
          disabled={categories.length === 0}
          className="rounded-2xl border border-line bg-white py-3 font-semibold text-ink-soft disabled:opacity-50"
        >
          {strings.budget.quickLines}
        </button>
      </div>

      {/* category bars; tap → edit planned amount */}
      <section className="rounded-2xl border border-line bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-ink-soft">
          {strings.budget.categories}
        </h2>
        {categories.length === 0 && (
          <p className="text-sm text-ink-soft">{strings.budget.emptyCategories}</p>
        )}
        <ul className="space-y-3">
          {categories.map((cat) => {
            const catSpent = spentByCategory.get(cat.id) ?? 0;
            const over = cat.planned_amount > 0 && catSpent > cat.planned_amount;
            return (
              <li key={cat.id}>
                <button
                  type="button"
                  onClick={() => setPlannedFor(cat)}
                  className="block w-full text-start"
                >
                  <span className="flex items-baseline justify-between text-sm">
                    <span className="font-medium text-ink">{cat.label_he}</span>
                    <span className={over ? "font-semibold text-rose-600" : "text-ink-soft"} dir="ltr">
                      {formatMoney(Math.round(catSpent), "ILS")} / {formatMoney(Math.round(cat.planned_amount), "ILS")}
                    </span>
                  </span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-paper-deep">
                    <span
                      className={`block h-full rounded-full ${over ? "bg-rose-500" : "bg-sea"}`}
                      style={{
                        width: `${
                          cat.planned_amount > 0
                            ? Math.min((catSpent / cat.planned_amount) * 100, 100)
                            : catSpent > 0
                              ? 100
                              : 0
                        }%`,
                      }}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <ConverterCard />

      {/* recent expenses */}
      <section className="rounded-2xl border border-line bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-ink-soft">
          {strings.budget.recentExpenses}
        </h2>
        {expenses.length === 0 ? (
          <p className="py-2 text-sm text-ink-soft">{strings.budget.emptyExpenses}</p>
        ) : (
          <ul className="divide-y divide-line">
            {expenses.map((expense) => (
              <li key={expense.id}>
                <button
                  type="button"
                  onClick={() => setExpenseForm({ expense })}
                  className="flex w-full items-baseline justify-between gap-2 py-2.5 text-start"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">
                      {expense.description || categoryLabel(expense.category_id)}
                    </span>
                    <span className="text-xs text-ink-soft">
                      {formatShortDate(expense.spent_on)} · {categoryLabel(expense.category_id)}
                      {expense.booking_id && <span aria-hidden="true"> · 🎫</span>}
                    </span>
                  </span>
                  <span className="shrink-0 text-end">
                    <span className="block text-sm font-semibold text-ink" dir="ltr">
                      {formatMoney(expense.amount_ils, "ILS")}
                    </span>
                    {expense.currency !== "ILS" && (
                      <span className="text-xs text-ink-soft" dir="ltr">
                        {formatMoney(expense.amount, expense.currency)}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- sheets ---------- */}

      <ExpenseFormSheet
        open={expenseForm !== null}
        expense={expenseForm?.expense ?? null}
        categories={categories}
        onClose={() => setExpenseForm(null)}
        onDone={(message) => {
          setExpenseForm(null);
          refreshNow();
          showToast(message);
        }}
        onError={(message) => showToast(message)}
      />

      <PlannedAmountSheet
        category={plannedFor}
        onClose={() => setPlannedFor(null)}
        onDone={() => {
          setPlannedFor(null);
          refreshNow();
        }}
        onError={() => showToast(strings.common.error)}
      />

      {quickLines && categories.length > 0 && (
        <QuickLinesSheet
          categories={categories}
          defaultCategoryId={
            // default to trip-prep for the pre-departure case (vaccinations,
            // visas…), else the first category
            (categories.find((c) => c.key === "prep") ?? categories[0]).id
          }
          onClose={() => setQuickLines(false)}
          onDone={(message) => {
            setQuickLines(false);
            refreshNow();
            showToast(message);
          }}
          onError={showToast}
        />
      )}

      <Toast message={toast} />
    </div>
  );
}
