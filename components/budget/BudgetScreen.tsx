"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Toast } from "@/components/Toast";
import { TicketIcon } from "@/components/icons";
import { getActiveTrip } from "@/lib/data/trip";
import { getTodayCountryCode } from "@/lib/data/today";
import { currencyForCountry } from "@/lib/currencies";
import { listCategories, listExpenses } from "@/lib/data/expenses";
import { formatMoney, formatShortDate, todayISO } from "@/lib/format";
import { resolveBudgetTotals } from "@/lib/budget";
import { strings } from "@/lib/strings";
import { tripPosition } from "@/lib/tripDay";
import type { BudgetCategory, Expense, Trip } from "@/lib/types";
import { ConverterCard } from "./ConverterCard";
import { ExpenseFormSheet } from "./ExpenseFormSheet";
import { CategorySheet } from "./CategorySheet";
import { TotalBudgetSheet } from "./TotalBudgetSheet";
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
  // null = closed; { category: null } = creating a new one.
  const [categoryForm, setCategoryForm] = useState<{
    category: BudgetCategory | null;
  } | null>(null);
  const [editingTotal, setEditingTotal] = useState(false);
  const [quickLines, setQuickLines] = useState(false);
  // Today's local currency, so a new expense opens in the money you're holding.
  const [localCurrency, setLocalCurrency] = useState<string | null>(null);

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
      void getTodayCountryCode(activeTrip.id)
        .then((code) => {
          if (!cancelled) setLocalCurrency(currencyForCountry(code));
        })
        .catch(() => {});
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
  const { planned, target, hasTarget, gap, overTarget, budgetForProgress } =
    resolveBudgetTotals(trip?.total_budget, categories);
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

  const position = tripPosition(trip?.start_date, trip?.end_date, today);
  const remaining = budgetForProgress - spent;
  const usedPct =
    budgetForProgress > 0 ? Math.round((spent / budgetForProgress) * 100) : 0;

  // The pace bar is segmented by category rather than one solid fill: at a
  // glance it says not only how much is gone but what it went on. Fills are
  // ordered largest first, the leader in sun and the rest in descending sea.
  const SEGMENT_TONES = [
    "var(--color-sun)",
    "var(--color-sea)",
    "var(--color-sea-deep)",
    "color-mix(in oklab, var(--color-sea) 55%, white)",
    "color-mix(in oklab, var(--color-sea) 30%, white)",
  ];
  const segments = categories
    .map((cat) => ({
      id: cat.id,
      label: cat.label_he,
      amount: spentByCategory.get(cat.id) ?? 0,
    }))
    .filter((seg) => seg.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-lg flex-col gap-3 px-4 pt-4 pb-8 sm:max-w-2xl lg:max-w-4xl">
      <h1 className="text-[22px] font-extrabold text-ink">{strings.nav.budget}</h1>

      {/* Three numbers, three cards — spent, left, per day. The old screen made
          you read a paragraph of a card to find any of them. */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="rounded-2xl border border-line bg-white px-3 py-2.5">
          <p className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-ink-soft">
            {strings.budget.kpiSpent}
          </p>
          <p className="mt-1 text-[17px] font-extrabold leading-none text-ink">
            {formatMoney(Math.round(spent), "ILS")}
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-white px-3 py-2.5">
          <p className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-ink-soft">
            {remaining < 0 ? strings.budget.kpiOver : strings.budget.kpiRemaining}
          </p>
          <p
            className={`mt-1 text-[17px] font-extrabold leading-none ${
              remaining < 0 ? "text-alert" : "text-ink"
            }`}
          >
            {budgetForProgress > 0
              ? formatMoney(Math.abs(Math.round(remaining)), "ILS")
              : "—"}
          </p>
        </div>
        {/* the screen's single sun-filled surface */}
        <div className="rounded-2xl border border-sun/20 bg-sun-tint px-3 py-2.5">
          <p className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-sun-deep">
            {strings.budget.kpiPerDay}
          </p>
          <p className="mt-1 text-[17px] font-extrabold leading-none text-sun-deep">
            {burnPerDay === null
              ? "—"
              : formatMoney(Math.round(burnPerDay), "ILS")}
          </p>
        </div>
      </div>

      {/* pace: how much is gone, how far through the trip we are, and what it
          projects to */}
      <section className="rounded-[18px] border border-line bg-white px-3.5 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[12.5px] font-bold text-ink">
            {budgetForProgress > 0
              ? strings.budget.paceTitle.replace("{n}", String(usedPct))
              : strings.budget.totalSpent}
          </p>
          {position && (
            <span className="shrink-0 text-[11px] text-ink-soft">
              {strings.today.dayOf
                .replace("{n}", String(position.day))
                .replace("{total}", String(position.total))}
            </span>
          )}
        </div>

        <div className="mt-2 flex h-[7px] gap-px overflow-hidden rounded-full bg-line">
          {segments.length === 0 ? null : (
            segments.map((seg, i) => (
              <span
                key={seg.id}
                title={seg.label}
                className="h-full first:rounded-s-full last:rounded-e-full"
                style={{
                  width: `${
                    budgetForProgress > 0
                      ? Math.min((seg.amount / budgetForProgress) * 100, 100)
                      : (seg.amount / Math.max(spent, 1)) * 100
                  }%`,
                  background: SEGMENT_TONES[Math.min(i, SEGMENT_TONES.length - 1)],
                }}
              />
            ))
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[11px] text-ink-soft">
          <span>
            {strings.budget.projection}{" "}
            <span className="font-bold text-ink" dir="ltr">
              {projection === null
                ? "—"
                : formatMoney(Math.round(projection), "ILS")}
            </span>
          </span>
          {preTripSpent > 0 && (
            <span>
              {strings.budget.beforeTrip}{" "}
              <span className="font-bold text-ink" dir="ltr">
                {formatMoney(Math.round(preTripSpent), "ILS")}
              </span>
            </span>
          )}
        </div>
        {notStarted && (
          <p className="mt-1 text-[11px] text-ink-faint">
            {strings.budget.tripNotStarted}
          </p>
        )}

        {/* The declared target, and how the plan sits against it. Tappable
            whether or not one is set — the first one has to start somewhere. */}
        <button
          type="button"
          onClick={() => setEditingTotal(true)}
          className="mt-2 flex w-full items-center justify-between gap-2 rounded-lg border-t border-line px-0.5 pt-2.5 text-[11px] hover:bg-paper-deep"
        >
          <span className="text-ink-soft">
            {hasTarget
              ? `${strings.budget.target}: ₪${Math.round(target!).toLocaleString("he-IL")}`
              : strings.budget.setTarget}
          </span>
          {hasTarget && (
            <span
              className={
                overTarget ? "font-bold text-alert" : "text-ink-soft"
              }
            >
              {overTarget
                ? `${strings.budget.overTarget} ₪${Math.abs(Math.round(gap)).toLocaleString("he-IL")}`
                : `${strings.budget.leftToAllocate} ₪${Math.round(gap).toLocaleString("he-IL")}`}
            </span>
          )}
        </button>
      </section>

      {/* category rows, ruled rather than carded; tap → edit planned amount */}
      <section className="overflow-hidden rounded-[18px] border border-line bg-white">
        <header className="flex items-center justify-between bg-paper-deep px-3.5 py-2.5">
          <h2 className="text-xs font-bold text-ink">
            {strings.budget.byCategory}
          </h2>
          <button
            type="button"
            onClick={() => setCategoryForm({ category: null })}
            className="rounded-full bg-white px-2.5 py-1 text-[10.5px] font-bold text-sea"
          >
            + {strings.budget.addCategory}
          </button>
        </header>
        {categories.length === 0 ? (
          <p className="px-3.5 py-4 text-[13px] text-ink-faint">
            {strings.budget.emptyCategories}
          </p>
        ) : (
          <ul>
            {categories.map((cat) => {
              const catSpent = spentByCategory.get(cat.id) ?? 0;
              const over =
                cat.planned_amount > 0 && catSpent > cat.planned_amount;
              const pct =
                cat.planned_amount > 0
                  ? Math.round((catSpent / cat.planned_amount) * 100)
                  : null;
              return (
                <li key={cat.id} className="border-t border-line">
                  <button
                    type="button"
                    onClick={() => setCategoryForm({ category: cat })}
                    className="block w-full px-3.5 py-2.5 text-start"
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="flex min-w-0 items-baseline gap-1.5">
                        <span className="truncate text-[14px] font-medium text-ink">
                          {cat.label_he}
                        </span>
                        {pct !== null && (
                          <span
                            className={`shrink-0 text-[10.5px] font-bold ${
                              over ? "text-sun-deep" : "text-ink-faint"
                            }`}
                            dir="ltr"
                          >
                            {pct}%
                          </span>
                        )}
                      </span>
                      <span
                        className={`shrink-0 text-[13.5px] font-bold ${
                          over ? "text-sun-deep" : "text-ink"
                        }`}
                        dir="ltr"
                      >
                        {formatMoney(Math.round(catSpent), "ILS")}
                        <span className="font-medium text-ink-faint">
                          {" / "}
                          {formatMoney(Math.round(cat.planned_amount), "ILS")}
                        </span>
                      </span>
                    </span>
                    {/* Only the category running ahead of plan takes sun;
                        colouring every bar would leave nothing to notice. */}
                    <span className="mt-1.5 block h-[3px] overflow-hidden rounded-full bg-line">
                      <span
                        className={`block h-full rounded-full ${
                          over ? "bg-sun" : "bg-sea"
                        }`}
                        style={{
                          width: `${
                            cat.planned_amount > 0
                              ? Math.min(
                                  (catSpent / cat.planned_amount) * 100,
                                  100
                                )
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
        )}
      </section>

      <ConverterCard />

      {/* recent expenses */}
      <section className="overflow-hidden rounded-[18px] border border-line bg-white">
        <header className="bg-paper-deep px-3.5 py-2.5">
          <h2 className="text-xs font-bold text-ink">
            {strings.budget.recentExpenses}
          </h2>
        </header>
        {expenses.length === 0 ? (
          <p className="px-3.5 py-4 text-[13px] text-ink-faint">
            {strings.budget.emptyExpenses}
          </p>
        ) : (
          <ul>
            {expenses.map((expense) => (
              <li key={expense.id} className="border-t border-line">
                <button
                  type="button"
                  onClick={() => setExpenseForm({ expense })}
                  className="flex w-full items-baseline justify-between gap-2 px-3.5 py-2.5 text-start"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-medium text-ink">
                      {expense.description || categoryLabel(expense.category_id)}
                    </span>
                    <span className="flex items-center gap-1 text-[10.5px] text-ink-soft">
                      {categoryLabel(expense.category_id)} ·{" "}
                      <span dir="ltr">{formatShortDate(expense.spent_on)}</span>
                      {expense.booking_id && (
                        <TicketIcon className="h-3 w-3 shrink-0 text-sea" />
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 text-end">
                    <span
                      className="block text-[13.5px] font-bold text-ink"
                      dir="ltr"
                    >
                      {formatMoney(expense.amount_ils, "ILS")}
                    </span>
                    {expense.currency !== "ILS" && (
                      <span className="text-[10.5px] text-ink-soft" dir="ltr">
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

      {/* The action the screen exists for sits last and within thumb reach. */}
      <div className="mt-auto grid grid-cols-2 gap-2.5 pt-1">
        <button
          type="button"
          onClick={() => setExpenseForm({ expense: null })}
          className="rounded-2xl bg-sea py-3 text-sm font-bold text-white active:bg-sea-deep"
          style={{ boxShadow: "0 10px 22px -14px rgba(14,124,107,.7)" }}
        >
          {strings.budget.addExpense}
        </button>
        <button
          type="button"
          onClick={() => setQuickLines(true)}
          disabled={categories.length === 0}
          className="rounded-2xl border border-line bg-white py-3 text-sm font-bold text-ink-soft disabled:opacity-50"
        >
          {strings.budget.quickLines}
        </button>
      </div>

      {/* ---------- sheets ---------- */}

      <ExpenseFormSheet
        open={expenseForm !== null}
        expense={expenseForm?.expense ?? null}
        categories={categories}
        localCurrency={localCurrency}
        onClose={() => setExpenseForm(null)}
        onDone={(message) => {
          setExpenseForm(null);
          refreshNow();
          showToast(message);
        }}
        onError={(message) => showToast(message)}
      />

      {categoryForm && trip && (
        <CategorySheet
          key={categoryForm.category?.id ?? "new"}
          tripId={trip.id}
          category={categoryForm.category}
          onClose={() => setCategoryForm(null)}
          onDone={() => {
            setCategoryForm(null);
            refreshNow();
          }}
          onError={(message) => showToast(message ?? strings.common.error)}
        />
      )}

      {editingTotal && trip && (
        <TotalBudgetSheet
          trip={trip}
          planned={planned}
          onClose={() => setEditingTotal(false)}
          onDone={() => {
            setEditingTotal(false);
            refreshNow();
          }}
          onError={() => showToast(strings.common.error)}
        />
      )}

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
