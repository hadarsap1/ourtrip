// Budget v2 (Phase 2.4) - the numbers behind the new budget screen. Pure, so
// they are tested without a clock or a client.

import type { Expense, ItineraryDay } from "@/lib/types";

const DAY_MS = 86_400_000;
const utc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const addDays = (iso: string, n: number) => new Date(utc(iso) + n * DAY_MS).toISOString().slice(0, 10);

/** ILS spent per day for the `n` days ending on `end`, oldest first. */
export function dailySpend(expenses: Pick<Expense, "spent_on" | "amount_ils">[], end: string, n = 14): number[] {
  const start = addDays(end, -(n - 1));
  const out = new Array<number>(n).fill(0);
  for (const e of expenses) {
    if (e.spent_on < start || e.spent_on > end) continue;
    out[Math.round((utc(e.spent_on) - utc(start)) / DAY_MS)] += e.amount_ils;
  }
  return out;
}

export type CountryVisit = { code: string; from: string; to: string };

/** Consecutive itinerary days in the same country, in date order. Days without a country break nothing. */
export function countryVisits(days: Pick<ItineraryDay, "date" | "country_code">[]): CountryVisit[] {
  const out: CountryVisit[] = [];
  for (const d of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!d.country_code) continue;
    const last = out[out.length - 1];
    if (last && last.code === d.country_code) last.to = d.date;
    else out.push({ code: d.country_code, from: d.date, to: d.date });
  }
  return out;
}

export type CountrySpend = {
  code: string;
  spent: number;
  /** Days spent there so far (today included), across all visits. 0 before arriving. */
  daysSoFar: number;
  /** Planned days there, across all visits. */
  daysPlanned: number;
  perDay: number | null;
};

/**
 * Spending per country: an expense belongs to the country the itinerary puts
 * the family in on `spent_on`. Spending before the first day or on a day with
 * no country lands in `unassigned` (pre-trip prep, flights bought at home).
 */
export function spendByCountry(
  expenses: Pick<Expense, "spent_on" | "amount_ils">[],
  days: Pick<ItineraryDay, "date" | "country_code">[],
  today: string
): { countries: CountrySpend[]; unassigned: number } {
  const countryOn = new Map(days.filter((d) => d.country_code).map((d) => [d.date, d.country_code as string]));
  const order: string[] = [];
  const acc = new Map<string, CountrySpend>();
  for (const v of countryVisits(days)) {
    if (!acc.has(v.code)) {
      order.push(v.code);
      acc.set(v.code, { code: v.code, spent: 0, daysSoFar: 0, daysPlanned: 0, perDay: null });
    }
    const c = acc.get(v.code)!;
    const planned = Math.round((utc(v.to) - utc(v.from)) / DAY_MS) + 1;
    c.daysPlanned += planned;
    if (today >= v.from) c.daysSoFar += Math.min(planned, Math.round((utc(today) - utc(v.from)) / DAY_MS) + 1);
  }
  let unassigned = 0;
  for (const e of expenses) {
    const code = countryOn.get(e.spent_on);
    const c = code ? acc.get(code) : undefined;
    if (c) c.spent += e.amount_ils;
    else unassigned += e.amount_ils;
  }
  for (const c of acc.values()) c.perDay = c.daysSoFar > 0 ? c.spent / c.daysSoFar : null;
  return { countries: order.map((k) => acc.get(k)!), unassigned };
}

export type VisitSummary = CountryVisit & { nights: number; spent: number; perDay: number; topCategoryId: string | null };

/** End-of-stay summaries: every country visit that ended before today, newest first. */
export function finishedVisitSummaries(
  expenses: Pick<Expense, "spent_on" | "amount_ils" | "category_id">[],
  days: Pick<ItineraryDay, "date" | "country_code">[],
  today: string
): VisitSummary[] {
  return countryVisits(days)
    .filter((v) => v.to < today)
    .map((v) => {
      const inVisit = expenses.filter((e) => e.spent_on >= v.from && e.spent_on <= v.to);
      const byCat = new Map<string, number>();
      for (const e of inVisit) byCat.set(e.category_id, (byCat.get(e.category_id) ?? 0) + e.amount_ils);
      const top = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const nights = Math.round((utc(v.to) - utc(v.from)) / DAY_MS) + 1;
      const spent = inVisit.reduce((s, e) => s + e.amount_ils, 0);
      return { ...v, nights, spent, perDay: spent / nights, topCategoryId: top };
    })
    .reverse();
}

/** SVG polyline points for a sparkline of `values` in a w×h box (RTL-agnostic: oldest on the left). */
export function sparkPoints(values: number[], w: number, h: number, pad = 2): string {
  if (values.length === 0) return "";
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  return values
    .map((v, i) => `${(pad + i * step).toFixed(1)},${(h - pad - (v / max) * (h - pad * 2)).toFixed(1)}`)
    .join(" ");
}
