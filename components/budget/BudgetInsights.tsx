"use client";

import { useMemo, useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { ProgressBar } from "@/components/ui/Progress";
import { expenseSlices, prepaidByCountry, scopeInsights, tripCountries } from "@/lib/budgetInsights";
import { findCountry, flagEmoji } from "@/lib/countries";
import { formatMoney, todayISO } from "@/lib/format";
import { strings } from "@/lib/strings";
import type { Booking, BudgetCategory, Expense, ItineraryDay } from "@/lib/types";

const t = strings.budgetInsights;
const ils = (n: number) => formatMoney(Math.round(n), "ILS");
const money = (n: number | null) => (n === null ? t.none : ils(n));
const countryName = (code: string | null) => (code ? (findCountry(code)?.he ?? code) : t.noCountry);

/**
 * Budget insights (DECISIONS #59): the whole trip or one country - what was
 * paid for it, what of that is already used and what is paid ahead, a normal
 * day's cost (everything / everyday cash only / lodging per night), the cash
 * picture, where the money went, and the countries side by side.
 * Derived from the cached budget, itinerary and bookings, so it works offline.
 */
export function BudgetInsights({
  categories,
  expenses,
  days,
  bookings,
}: {
  categories: BudgetCategory[];
  /** As entered - withdrawals are reduced inside, never pass counted ones. */
  expenses: Expense[];
  days: ItineraryDay[];
  bookings: Booking[];
}) {
  const today = todayISO();
  const countries = useMemo(() => tripCountries(days), [days]);
  const todayCountry = days.find((d) => d.date === today)?.country_code ?? null;
  // Opens on the country we are in: "where do we stand in Vietnam" is the question.
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const scope = picked === undefined ? (todayCountry && countries.includes(todayCountry) ? todayCountry : null) : picked;

  const slices = useMemo(() => expenseSlices(expenses, days, bookings), [expenses, days, bookings]);
  const ins = useMemo(
    () => scopeInsights(slices, expenses, days, categories, bookings, scope, today),
    [slices, expenses, days, categories, bookings, scope, today]
  );
  const compare = useMemo(
    () => (scope === null ? countries.map((c) => scopeInsights(slices, expenses, days, categories, bookings, c, today)) : []),
    [scope, countries, slices, expenses, days, categories, bookings, today]
  );
  const prepaid = useMemo(() => (scope === null ? prepaidByCountry(slices, days, today) : []), [scope, slices, days, today]);
  const catLabel = (id: string) => (id === "" ? t.everydayLine : (categories.find((c) => c.id === id)?.label_he ?? t.otherCategory));

  const card = "rounded-card border border-line bg-surface px-3.5 py-3";

  return (
    <div className="space-y-2.5">
      {countries.length > 0 && (
        <div role="group" aria-label={t.scopeLabel} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
          <Chip selected={scope === null} onClick={() => setPicked(null)}>
            {t.wholeTrip}
          </Chip>
          {countries.map((c) => (
            <Chip key={c} selected={scope === c} onClick={() => setPicked(c)}>
              <span aria-hidden="true">{flagEmoji(c)}</span>
              {countryName(c)}
            </Chip>
          ))}
        </div>
      )}

      {ins.total === 0 ? (
        <p className={`${card} text-sm text-ink-soft`}>{t.empty}</p>
      ) : (
        <>
          {/* what was paid for this scope, split into used and ahead */}
          <section className={card}>
            <p className="ot-kicker">{t.paidTitle.replace("{scope}", scope === null ? t.wholeTrip : countryName(scope))}</p>
            <p className="mt-1 text-[26px] font-extrabold leading-8 tabular-nums text-ink">
              <bdi>{ils(ins.total)}</bdi>
            </p>
            <dl className="mt-2.5 grid grid-cols-3 gap-2 border-t border-line pt-2.5">
              <Stat label={t.used} value={ils(ins.used)} />
              <Stat label={t.prepaid} value={ils(ins.prepaid)} />
              <Stat label={t.days} value={t.daysValue.replace("{n}", String(ins.daysSoFar)).replace("{total}", String(ins.daysPlanned))} />
            </dl>
            {ins.noCountry > 0 && (
              <p className="mt-2 text-xs text-ink-soft">
                <bdi>{t.noCountryNote.replace("{amount}", ils(ins.noCountry))}</bdi>
              </p>
            )}
          </section>

          {/* a normal day */}
          <section className={card}>
            <h2 className="text-sm font-bold text-ink">{t.averagesTitle}</h2>
            {ins.daysSoFar === 0 && scope !== null ? (
              <p className="mt-1 text-xs text-ink-soft">{t.notStarted}</p>
            ) : (
              <dl className="mt-2 grid grid-cols-3 gap-2">
                <Stat label={t.perDayAll} value={money(ins.perDay)} strong />
                <Stat label={t.perDayEveryday} value={money(ins.everydayPerDay)} strong />
                <Stat
                  label={t.lodgingPerNight}
                  value={money(ins.lodgingPerNight)}
                  note={ins.lodgingPerNight !== null ? t.lodgingNights.replace("{n}", String(ins.lodgingNights)) : undefined}
                  strong
                />
              </dl>
            )}
            <p className="mt-2 text-xs text-ink-soft">{t.everydayHint}</p>
          </section>

          {/* cash */}
          <section className={card}>
            <h2 className="text-sm font-bold text-ink">{t.cashTitle}</h2>
            {ins.cash.withdrawals === 0 ? (
              <p className="mt-1 text-xs text-ink-soft">{t.cashNone}</p>
            ) : (
              <>
                <dl className="mt-2 grid grid-cols-3 gap-2">
                  <Stat label={t.cashWithdrawn} value={ils(ins.cash.withdrawn)} note={t.cashWithdrawals.replace("{n}", String(ins.cash.withdrawals))} />
                  <Stat label={t.cashItemized} value={ils(ins.cash.itemized)} />
                  <Stat label={t.cashEveryday} value={ils(ins.cash.everyday)} />
                </dl>
                <div className="mt-2.5">
                  <ProgressBar value={ins.cash.itemized} max={Math.max(ins.cash.withdrawn, 1)} colorClass="bg-sun" label={t.cashItemized} />
                </div>
              </>
            )}
          </section>

          {/* where the money went */}
          <section className={card}>
            <h2 className="text-sm font-bold text-ink">{t.categoriesTitle}</h2>
            <ul className="mt-2 space-y-2">
              {ins.byCategory.map((c) => (
                <li key={c.categoryId || "everyday"}>
                  <p className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className={`truncate ${c.categoryId === "" ? "font-bold text-sea-deep" : "text-ink"}`}>{catLabel(c.categoryId)}</span>
                    <span className="shrink-0 tabular-nums text-ink">
                      <bdi>{ils(c.amount)}</bdi>
                      <span className="ms-1.5 text-xs text-ink-soft">{c.pct}%</span>
                    </span>
                  </p>
                  <ProgressBar value={c.pct} colorClass={c.categoryId === "" ? "bg-sea-deep" : "bg-sea"} label={catLabel(c.categoryId)} />
                </li>
              ))}
            </ul>
          </section>

          {prepaid.length > 0 && (
            <section className={card}>
              <h2 className="text-sm font-bold text-ink">{t.prepaidTitle}</h2>
              <ul className="mt-1.5">
                {prepaid.map((p) => (
                  <li key={p.code ?? "none"} className="flex items-center justify-between gap-2 border-t border-line py-2 text-sm first:border-t-0">
                    <span className="flex items-center gap-1.5 text-ink">
                      {p.code && <span aria-hidden="true">{flagEmoji(p.code)}</span>}
                      {countryName(p.code)}
                    </span>
                    <span className="font-bold tabular-nums text-ink"><bdi>{ils(p.amount)}</bdi></span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {compare.length > 1 && (
            <section className={card}>
              <h2 className="text-sm font-bold text-ink">{t.compareTitle}</h2>
              <table className="mt-1.5 w-full text-sm tabular-nums">
                <thead>
                  <tr className="text-xs text-ink-soft">
                    <th className="py-1 text-start font-semibold" />
                    <th className="py-1 text-end font-semibold">{t.compareDays}</th>
                    <th className="py-1 text-end font-semibold">{t.comparePerDay}</th>
                    <th className="py-1 text-end font-semibold">{t.compareEveryday}</th>
                    <th className="py-1 text-end font-semibold">{t.compareLodging}</th>
                  </tr>
                </thead>
                <tbody>
                  {compare.map((c) => (
                    <tr key={c.scope} className="border-t border-line">
                      <th scope="row" className="py-2 text-start font-semibold text-ink">
                        <button type="button" onClick={() => setPicked(c.scope)} className="flex items-center gap-1.5 text-start">
                          <span aria-hidden="true">{flagEmoji(c.scope!)}</span>
                          <span className="truncate">{countryName(c.scope)}</span>
                        </button>
                      </th>
                      <td className="py-2 text-end text-ink-soft">
                        <bdi>{t.daysValue.replace("{n}", String(c.daysSoFar)).replace("{total}", String(c.daysPlanned))}</bdi>
                      </td>
                      <td className="py-2 text-end text-ink"><bdi>{money(c.perDay)}</bdi></td>
                      <td className="py-2 text-end text-ink"><bdi>{money(c.everydayPerDay)}</bdi></td>
                      <td className="py-2 text-end text-ink"><bdi>{money(c.lodgingPerNight)}</bdi></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <p className="px-0.5 text-xs text-ink-soft">{t.howPlaced}</p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, note, strong = false }: { label: string; value: string; note?: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className={`tabular-nums text-ink ${strong ? "text-lg font-extrabold" : "text-sm font-bold"}`}>
        <bdi>{value}</bdi>
      </dd>
      {note && <dd className="text-xs text-ink-soft">{note}</dd>}
    </div>
  );
}
