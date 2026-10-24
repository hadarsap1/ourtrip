"use client";

import { useState, useSyncExternalStore } from "react";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Ring } from "@/components/ui/Progress";
import { dailySpend, finishedVisitSummaries, sparkPoints, spendByCountry } from "@/lib/budgetV2";
import { flagEmoji, findCountry } from "@/lib/countries";
import { formatMoney, formatShortDate, todayISO } from "@/lib/format";
import { readFxStore } from "@/lib/fxCache";
import { strings } from "@/lib/strings";
import type { BudgetCategory, Expense, ItineraryDay } from "@/lib/types";

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
 * 14-day sparkline, then categories as rings or spending per country with
 * end-of-stay summaries, and the offline FX stamp. Everything is derived from
 * the same expenses/categories the screen already loaded (cache-first), plus
 * the itinerary days for the country view - so it all renders offline.
 */
export function BudgetV2({
  categories,
  expenses,
  days,
  budgetForProgress,
  remaining,
  onEditCategory,
}: {
  categories: BudgetCategory[];
  expenses: Expense[];
  days: ItineraryDay[];
  budgetForProgress: number;
  remaining: number;
  onEditCategory: (c: BudgetCategory) => void;
}) {
  const [tab, setTab] = useState<"categories" | "countries">("categories");
  const stamp = useSyncExternalStore(noop, ratesStamp, () => null);
  const today = todayISO();

  const spentToday = expenses.filter((e) => e.spent_on === today).reduce((s, e) => s + e.amount_ils, 0);
  const spentTotal = expenses.reduce((sum, e) => sum + e.amount_ils, 0);
  const series = dailySpend(expenses, today, 14);
  const spentBy = new Map<string, number>();
  for (const e of expenses) spentBy.set(e.category_id, (spentBy.get(e.category_id) ?? 0) + e.amount_ils);
  const byCountry = spendByCountry(expenses, days, today);
  const summaries = finishedVisitSummaries(expenses, days, today);
  const catLabel = (id: string | null) => categories.find((c) => c.id === id)?.label_he ?? "";
  // No "left today": much is prepaid (flights, hotels, attractions), so a
  // daily share means nothing (Hadar, 06/10/2026). The trip total is the number.
  const over = remaining < 0;

  return (
    <div className="space-y-3">
      {/* hero: what is left for the whole trip */}
      <section className="rounded-[20px] border border-line bg-surface px-4 py-3.5 shadow-[var(--e1)]">
        <p className="ot-kicker">{over ? t.overTrip : t.leftTrip}</p>
        {budgetForProgress > 0 ? (
          <p className={`mt-1 text-[40px] font-extrabold leading-[46px] tabular-nums ${over ? "text-danger" : "text-ink"}`}>
            <bdi>{ils(Math.abs(remaining))}</bdi>
          </p>
        ) : (
          <p className="mt-1 text-sm text-ink-soft">{t.noBudget}</p>
        )}
        <div className="mt-3 flex items-end justify-between gap-3 border-t border-line pt-3">
          <div>
            <p className="text-[12px] text-ink-soft">{t.spentTotal}</p>
            <p className="text-[17px] font-extrabold tabular-nums text-ink">
              <bdi>{ils(spentTotal)}</bdi>
            </p>
          </div>
          <figure className="text-end">
            <svg viewBox="0 0 120 32" width={120} height={32} role="img" aria-label={t.last14} className="text-sea">
              <polyline points={sparkPoints(series, 120, 32)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </svg>
            <figcaption className="text-[12px] text-ink-soft">
              {t.last14} · <bdi>{t.spentTodayLabel.replace("{amount}", ils(spentToday))}</bdi>
            </figcaption>
          </figure>
        </div>
      </section>

      <SegmentedControl
        ariaLabel={t.tabsLabel}
        value={tab}
        onChange={setTab}
        options={[
          { value: "categories", label: t.tabCategories },
          { value: "countries", label: t.tabCountries },
        ]}
      />

      {tab === "categories" ? (
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {categories.map((c) => {
            const spent = spentBy.get(c.id) ?? 0;
            const overCat = c.planned_amount > 0 && spent > c.planned_amount;
            const pct = c.planned_amount > 0 ? Math.round((spent / c.planned_amount) * 100) : null;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onEditCategory(c)}
                  className="flex w-full items-center gap-2.5 rounded-[18px] border border-line bg-surface p-3 text-start"
                >
                  <Ring value={spent} max={c.planned_amount || Math.max(spent, 1)} size={52} stroke={6} colorVar={overCat ? "var(--warning)" : "var(--brand)"}>
                    <span className="text-[12px] font-bold tabular-nums">{pct === null ? "-" : `${pct}%`}</span>
                  </Ring>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-ink">{c.label_he}</span>
                    <span className="block text-[12px] tabular-nums text-ink-soft">
                      <bdi>{ils(spent)}</bdi>
                    </span>
                    <span className="block text-[12px] text-ink-soft">
                      {c.planned_amount > 0 ? <bdi>{t.ofPlanned.replace("{amount}", ils(c.planned_amount))}</bdi> : t.noPlan}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="space-y-2.5">
          <ul className="overflow-hidden rounded-[18px] border border-line bg-surface">
            {byCountry.countries.map((c) => (
              <li key={c.code} className="flex items-center justify-between gap-3 border-t border-line px-3.5 py-2.5 first:border-t-0">
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden="true" className="text-lg">{flagEmoji(c.code)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-ink">{findCountry(c.code)?.he ?? c.code}</span>
                    <span className="block text-[12px] text-ink-soft">
                      {c.daysSoFar > 0 ? t.daysSoFar.replace("{n}", String(c.daysSoFar)).replace("{total}", String(c.daysPlanned)) : t.notYet}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 text-end">
                  <span className="block text-sm font-bold tabular-nums text-ink"><bdi>{ils(c.spent)}</bdi></span>
                  {c.perDay !== null && (
                    <span className="block text-[12px] tabular-nums text-ink-soft"><bdi>{t.perDay.replace("{amount}", ils(c.perDay))}</bdi></span>
                  )}
                </span>
              </li>
            ))}
            {byCountry.unassigned > 0 && (
              <li className="flex items-center justify-between gap-3 border-t border-line bg-paper-deep px-3.5 py-2.5">
                <span className="text-[12px] font-semibold text-ink-soft">{t.unassigned}</span>
                <span className="text-sm font-bold tabular-nums text-ink"><bdi>{ils(byCountry.unassigned)}</bdi></span>
              </li>
            )}
          </ul>

          {summaries.length > 0 && (
            <section>
              <h2 className="mb-1.5 px-0.5 text-xs font-bold text-ink">{t.summariesTitle}</h2>
              <ul className="space-y-2">
                {summaries.map((v) => (
                  <li key={`${v.code}-${v.from}`} className="rounded-[18px] border border-line bg-surface px-3.5 py-3">
                    <p className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
                        <span aria-hidden="true">{flagEmoji(v.code)}</span>
                        {findCountry(v.code)?.he ?? v.code}
                      </span>
                      <span className="text-sm font-extrabold tabular-nums text-ink"><bdi>{ils(v.spent)}</bdi></span>
                    </p>
                    <p className="mt-0.5 flex flex-wrap justify-between gap-x-3 text-[12px] text-ink-soft">
                      <span>
                        <bdi>{t.summaryNights.replace("{n}", String(v.nights)).replace("{from}", formatShortDate(v.from)).replace("{to}", formatShortDate(v.to))}</bdi>
                      </span>
                      <span><bdi>{t.perDay.replace("{amount}", ils(v.perDay))}</bdi></span>
                    </p>
                    {v.topCategoryId && <p className="mt-0.5 text-[12px] text-ink-soft">{t.summaryTop.replace("{category}", catLabel(v.topCategoryId))}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <p className="text-center text-[12px] text-ink-soft">{stamp ? t.ratesUpdated.replace("{when}", stamp) : t.ratesNever}</p>
    </div>
  );
}
