"use client";

import { useState } from "react";
import { DEFAULT_FILTER, filterChanges, isDefaultFilter, type CategoryRows, type InsightFilter } from "@/lib/budgetInsights";
import { formatMoney, formatShortDate } from "@/lib/format";
import { strings } from "@/lib/strings";

const t = strings.budgetInsights;
const ils = (n: number) => formatMoney(Math.round(n), "ILS");

const STORAGE_KEY = "ot.budgetInsights.filter.v1";
const isoOrNull = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function readStored(): InsightFilter {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FILTER;
    const o = JSON.parse(raw) as Record<string, unknown>;
    return {
      from: isoOrNull(o.from),
      to: isoOrNull(o.to),
      includePrep: o.includePrep !== false,
      includePrepaid: o.includePrepaid !== false,
      excludedCategories: ids(o.excludedCategories),
      excludedExpenses: ids(o.excludedExpenses),
    };
  } catch {
    return DEFAULT_FILTER;
  }
}

/** The analysis choice, kept on this phone only (Hadar 26/11/2026). */
export function useInsightFilter(): [InsightFilter, (f: InsightFilter) => void] {
  // the insights tab is opened by a tap, never server-rendered: read at once
  const [filter, setFilter] = useState<InsightFilter>(() => (typeof window === "undefined" ? DEFAULT_FILTER : readStored()));
  const update = (f: InsightFilter) => {
    setFilter(f);
    try {
      if (isDefaultFilter(f)) window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(f));
    } catch {
      // private window or blocked storage: the choice lasts until the page closes
    }
  };
  return [filter, update];
}

/** "שינוי אחד" / "3 שינויים". */
export const changesText = (n: number) => (n === 1 ? t.filterChangedOne : t.filterChanged.replace("{n}", String(n)));

const toggle = (list: string[], id: string, on: boolean) => (on ? list.filter((x) => x !== id) : [...list, id]);
const checkbox = "h-5 w-5 shrink-0 accent-[var(--brand)]";

/**
 * What is in the analysis: a date range, the preparations before the trip,
 * what is paid ahead, and every category and expense in scope - each can be
 * left out and put back. Everything above recomputes at once.
 */
export function InsightFilterPanel({
  filter,
  onChange,
  rows,
  prepAmount,
  prepaidAmount,
  catLabel,
  expenseLabel,
}: {
  filter: InsightFilter;
  onChange: (f: InsightFilter) => void;
  /** Categories in scope, exclusions still listed. */
  rows: CategoryRows[];
  prepAmount: number;
  prepaidAmount: number;
  catLabel: (id: string) => string;
  expenseLabel: (id: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const changes = filterChanges(filter);
  const excludedCats = new Set(filter.excludedCategories);
  const excludedIds = new Set(filter.excludedExpenses);
  const set = (patch: Partial<InsightFilter>) => onChange({ ...filter, ...patch });

  return (
    <section className={`rounded-card border px-3.5 py-3 ${changes > 0 ? "border-sea bg-sea-tint" : "border-line bg-surface"}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-start"
      >
        <span className="min-w-0">
          <span className="block text-sm font-bold text-ink">{t.filterTitle}</span>
          <span className="block text-xs text-ink-soft">
            {changes === 0 ? t.filterAll : changesText(changes)}
          </span>
        </span>
        <span className="shrink-0 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-sea-deep">
          {open ? t.filterClose : t.filterOpen}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          {/* date range */}
          <fieldset>
            <legend className="mb-1 text-xs font-bold text-ink-soft">{t.filterRange}</legend>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-ink-soft">
                {t.filterFrom}
                <input
                  type="date"
                  dir="ltr"
                  value={filter.from ?? ""}
                  max={filter.to ?? undefined}
                  onChange={(e) => set({ from: e.target.value || null })}
                  className="mt-0.5 block w-full rounded-xl border border-line bg-surface px-2 py-2 text-sm text-ink"
                />
              </label>
              <label className="text-xs text-ink-soft">
                {t.filterTo}
                <input
                  type="date"
                  dir="ltr"
                  value={filter.to ?? ""}
                  min={filter.from ?? undefined}
                  onChange={(e) => set({ to: e.target.value || null })}
                  className="mt-0.5 block w-full rounded-xl border border-line bg-surface px-2 py-2 text-sm text-ink"
                />
              </label>
            </div>
            {(filter.from || filter.to) && (
              <button type="button" onClick={() => set({ from: null, to: null })} className="mt-1 text-xs font-semibold text-sea-deep underline">
                {t.filterRangeClear}
              </button>
            )}
          </fieldset>

          {/* preparations and paid ahead */}
          <div className="space-y-1">
            <label className="flex cursor-pointer items-start gap-3 py-1.5">
              <input type="checkbox" checked={filter.includePrep} onChange={(e) => set({ includePrep: e.target.checked })} className={`${checkbox} mt-0.5`} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2 text-sm text-ink">
                  {t.filterPrep}
                  <bdi className="shrink-0 tabular-nums">{ils(prepAmount)}</bdi>
                </span>
                <span className="block text-xs text-ink-soft">{t.filterPrepHint}</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-3 py-1.5">
              <input type="checkbox" checked={filter.includePrepaid} onChange={(e) => set({ includePrepaid: e.target.checked })} className={checkbox} />
              <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2 text-sm text-ink">
                {t.filterPrepaid}
                <bdi className="shrink-0 tabular-nums">{ils(prepaidAmount)}</bdi>
              </span>
            </label>
          </div>

          {/* categories, each opening to its expenses */}
          {rows.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-bold text-ink-soft">{t.filterCategories}</p>
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {rows.map((c) => {
                  const catOn = !excludedCats.has(c.categoryId);
                  const isOpen = expanded === c.categoryId;
                  const key = c.categoryId || "everyday";
                  return (
                    <li key={key} className="px-2.5">
                      <div className="flex items-center gap-2">
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-2">
                          <input
                            type="checkbox"
                            checked={catOn}
                            onChange={(e) => set({ excludedCategories: toggle(filter.excludedCategories, c.categoryId, e.target.checked) })}
                            className={checkbox}
                          />
                          <span className={`min-w-0 flex-1 truncate text-sm ${catOn ? "font-semibold text-ink" : "text-ink-faint line-through"}`}>
                            {catLabel(c.categoryId)}
                          </span>
                          <bdi className={`shrink-0 text-sm tabular-nums ${catOn ? "text-ink" : "text-ink-faint"}`}>{ils(c.amount)}</bdi>
                        </label>
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : c.categoryId)}
                          aria-expanded={isOpen}
                          className="shrink-0 px-1 text-xs font-semibold text-sea-deep underline"
                        >
                          {isOpen ? t.filterHideDetails : `${t.filterDetails} (${c.rows.length})`}
                        </button>
                      </div>
                      {isOpen && (
                        <ul className="mb-2 ms-8 space-y-0.5">
                          {c.rows.map((r) => {
                            const on = catOn && !excludedIds.has(r.expenseId);
                            return (
                              <li key={r.expenseId}>
                                <label className="flex cursor-pointer items-center gap-3 py-1.5">
                                  <input
                                    type="checkbox"
                                    checked={on}
                                    disabled={!catOn}
                                    onChange={(e) => set({ excludedExpenses: toggle(filter.excludedExpenses, r.expenseId, e.target.checked) })}
                                    className={checkbox}
                                  />
                                  <span className="min-w-0 flex-1">
                                    <span className={`block truncate text-sm ${on ? "text-ink" : "text-ink-faint line-through"}`}>{expenseLabel(r.expenseId)}</span>
                                    <span className="block text-xs text-ink-soft">
                                      <bdi>{formatShortDate(r.date)}</bdi>
                                      {r.spread && ` · ${t.filterSpread}`}
                                      {r.prep && ` · ${t.filterPrepTag}`}
                                    </span>
                                  </span>
                                  <bdi className={`shrink-0 text-sm tabular-nums ${on ? "text-ink" : "text-ink-faint"}`}>{ils(r.amount)}</bdi>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-ink-soft">{t.filterLocalNote}</p>
            {changes > 0 && (
              <button type="button" onClick={() => onChange(DEFAULT_FILTER)} className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-sea-deep">
                {t.filterReset}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
