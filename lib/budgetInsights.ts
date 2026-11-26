// Budget insights (DECISIONS #59) - where the money went, per country, and
// what a normal day really costs. Pure, so it is tested without a clock or a
// client, and it renders offline from the cached budget.
//
// WHERE AN EXPENSE BELONGS. Not the day it was paid: a Japan hotel paid from
// Hanoi is Japan's. In order:
//   1. the expense's own country (expenses.country_code, 00088) when set;
//   2. a linked booking: a hotel is spread over its nights, anything else
//      sits on the booking's first day - each piece in the country the
//      itinerary puts the family in on that day;
//   3. otherwise the day it was paid, in that day's country.
// A piece on a day with no country (before the trip, prep at home) has no
// country: it counts in the trip total, never in a per-day average.
//
// EVERYDAY vs SPECIFIC (Hadar 10/11/2026). Day-to-day spending is cash, logged
// as one expense per ATM withdrawal; what is paid from that cash and logged on
// its own is marked paid in cash (00089, one wallet per currency). So
// "everyday" is the cash of the withdrawals not logged as any expense
// (countedExpenses), and everything logged on its own is "specific".
//
// PAID vs USED. A piece dated after today is paid in advance: it is in the
// totals, and it is kept out of the "so far" averages until its day comes.

import { countedExpenses } from "@/lib/budget";
import { countryVisits } from "@/lib/budgetV2";
import type { BudgetCategory, Booking, Expense, ItineraryDay } from "@/lib/types";

const DAY_MS = 86_400_000;
const utc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const addDays = (iso: string, n: number) => new Date(utc(iso) + n * DAY_MS).toISOString().slice(0, 10);
const daysFrom = (from: string, to: string) => Math.round((utc(to) - utc(from)) / DAY_MS);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** A booking stay longer than this is not spread (a typo in an end date
 *  would otherwise smear a payment over a year). */
const MAX_SPREAD_NIGHTS = 120;

export type InsightExpense = Pick<
  Expense,
  | "id"
  | "amount"
  | "currency"
  | "amount_ils"
  | "spent_on"
  | "category_id"
  | "booking_id"
  | "country_code"
  | "is_cash_withdrawal"
  | "paid_in_cash"
>;
export type InsightBooking = Pick<Booking, "id" | "type" | "start_date" | "end_date">;
export type InsightDay = Pick<ItineraryDay, "date" | "country_code">;
export type InsightCategory = Pick<BudgetCategory, "id" | "key">;

export type Slice = {
  expenseId: string;
  date: string;
  country: string | null;
  amount: number;
  categoryId: string;
  /** "everyday" = what is left of a cash withdrawal; "specific" = logged on its own. */
  kind: "everyday" | "specific";
  /** Part of a hotel booking spread over its nights. */
  spread: boolean;
};

/** Every expense as the pieces it pays for: dated, placed in a country, counted once. */
export function expenseSlices(
  expenses: InsightExpense[],
  days: InsightDay[],
  bookings: InsightBooking[]
): Slice[] {
  const countryOn = new Map(days.filter((d) => d.country_code).map((d) => [d.date, d.country_code as string]));
  const bookingById = new Map(bookings.map((b) => [b.id, b]));
  const out: Slice[] = [];
  for (const e of countedExpenses(expenses)) {
    if (e.amount_ils <= 0) continue;
    const kind = e.is_cash_withdrawal ? "everyday" : "specific";
    const place = (date: string) => e.country_code ?? countryOn.get(date) ?? null;
    const b = e.booking_id ? bookingById.get(e.booking_id) : undefined;
    const nights = b?.start_date && b.end_date ? daysFrom(b.start_date, b.end_date) : 0;
    if (b?.type === "hotel" && b.start_date && nights >= 2 && nights <= MAX_SPREAD_NIGHTS) {
      // equal shares, the rounding remainder on the last night so the pieces add up exactly
      const share = round2(e.amount_ils / nights);
      for (let i = 0; i < nights; i++) {
        const date = addDays(b.start_date, i);
        const amount = i === nights - 1 ? round2(e.amount_ils - share * (nights - 1)) : share;
        out.push({ expenseId: e.id, date, country: place(date), amount, categoryId: e.category_id, kind, spread: true });
      }
      continue;
    }
    const date = b?.start_date ?? e.spent_on;
    out.push({ expenseId: e.id, date, country: place(date), amount: e.amount_ils, categoryId: e.category_id, kind, spread: false });
  }
  return out;
}

export type CategoryShare = { categoryId: string; amount: number; pct: number };

export type ScopeInsights = {
  /** Country code, or null for the whole trip. */
  scope: string | null;
  /** Everything paid that belongs here, used or not yet. */
  total: number;
  /** Belongs to a day still ahead (paid in advance). */
  prepaid: number;
  /** Belongs to today or earlier. */
  used: number;
  /** Itinerary days here up to today, and in all. */
  daysSoFar: number;
  daysPlanned: number;
  /** Used, on days with a country, per day so far. null before the first day. */
  perDay: number | null;
  /** Cash withdrawals not itemized, used so far. */
  everyday: number;
  everydayPerDay: number | null;
  /** Lodging per night: lodging pieces / nights they cover. null without lodging. */
  lodgingPerNight: number | null;
  lodgingNights: number;
  /** Specific expenses by category, largest first, plus everyday cash as its own line. */
  byCategory: CategoryShare[];
  /** Before the trip or on a day with no country (whole-trip scope only). */
  noCountry: number;
  cash: { withdrawn: number; itemized: number; everyday: number; withdrawals: number };
};

/** The category key that means lodging (seeded as 'lodging'). */
const LODGING_KEY = "lodging";

/**
 * Insights for the whole trip (`scope` null) or one country.
 * `byCategory` lists specific spending per category; everyday cash is the
 * line with categoryId "" so it is never folded into the category the
 * withdrawal happened to be filed under.
 */
export function scopeInsights(
  slices: Slice[],
  expenses: InsightExpense[],
  days: InsightDay[],
  categories: InsightCategory[],
  bookings: InsightBooking[],
  scope: string | null,
  today: string,
  /** Which cash withdrawals the cash picture counts (the analysis filter). */
  keepWithdrawal: (e: InsightExpense) => boolean = () => true
): ScopeInsights {
  const inScope = scope === null ? slices : slices.filter((s) => s.country === scope);
  const scopeDays = days.filter((d) => d.country_code && (scope === null || d.country_code === scope));
  const daysPlanned = new Set(scopeDays.map((d) => d.date)).size;
  const daysSoFar = new Set(scopeDays.filter((d) => d.date <= today).map((d) => d.date)).size;

  let total = 0;
  let prepaid = 0;
  let usedWithCountry = 0;
  let everyday = 0;
  let noCountry = 0;
  const byCat = new Map<string, number>();
  for (const s of inScope) {
    total += s.amount;
    if (s.date > today) prepaid += s.amount;
    else if (s.country) usedWithCountry += s.amount;
    if (!s.country) noCountry += s.amount;
    if (s.kind === "everyday" && s.date <= today && s.country) everyday += s.amount;
    const key = s.kind === "everyday" ? "" : s.categoryId;
    byCat.set(key, (byCat.get(key) ?? 0) + s.amount);
  }

  // Lodging per night: a spread hotel covers its own nights; a lodging
  // expense that is not spread (paid at the desk, no booking dates) is
  // measured against the nights here, up to today, that no spread hotel
  // covers - future nights are not paid at a desk yet.
  const lodgingIds = new Set(categories.filter((c) => c.key === LODGING_KEY).map((c) => c.id));
  const hotelBookingIds = new Set(bookings.filter((b) => b.type === "hotel").map((b) => b.id));
  const hotelExpenseIds = new Set(expenses.filter((e) => e.booking_id && hotelBookingIds.has(e.booking_id)).map((e) => e.id));
  const lodging = inScope.filter((s) => s.kind === "specific" && (lodgingIds.has(s.categoryId) || hotelExpenseIds.has(s.expenseId)));
  const lodgingAmount = lodging.reduce((sum, s) => sum + s.amount, 0);
  const coveredNights = new Set(lodging.filter((s) => s.spread).map((s) => s.date));
  const hasLoose = lodging.some((s) => !s.spread);
  const looseNights = hasLoose ? scopeDays.filter((d) => d.date <= today && !coveredNights.has(d.date)).length : 0;
  const lodgingNights = coveredNights.size + (hasLoose ? Math.max(looseNights, 1) : 0);

  // Cash: withdrawals made here (by their own placement), and how much of them
  // the cash expenses logged on their own used up (the rest is everyday).
  const counted = new Map(countedExpenses(expenses).map((e) => [e.id, e.amount_ils]));
  let withdrawn = 0;
  let unlogged = 0;
  let withdrawals = 0;
  const countryOn = new Map(days.filter((d) => d.country_code).map((d) => [d.date, d.country_code as string]));
  const placeOf = (e: InsightExpense) => e.country_code ?? countryOn.get(e.spent_on) ?? null;
  for (const e of expenses) {
    if (!e.is_cash_withdrawal || !keepWithdrawal(e)) continue;
    if (scope !== null && placeOf(e) !== scope) continue;
    withdrawn += e.amount_ils;
    unlogged += counted.get(e.id) ?? e.amount_ils;
    withdrawals += 1;
  }

  const sum = [...byCat.values()].reduce((a, b) => a + b, 0);
  const byCategory = [...byCat.entries()]
    .map(([categoryId, amount]) => ({ categoryId, amount, pct: sum > 0 ? Math.round((amount / sum) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount);

  return {
    scope,
    total,
    prepaid,
    used: total - prepaid,
    daysSoFar,
    daysPlanned,
    perDay: daysSoFar > 0 ? usedWithCountry / daysSoFar : null,
    everyday,
    everydayPerDay: daysSoFar > 0 ? everyday / daysSoFar : null,
    lodgingPerNight: lodgingAmount > 0 && lodgingNights > 0 ? lodgingAmount / lodgingNights : null,
    lodgingNights,
    byCategory,
    noCountry: scope === null ? noCountry : 0,
    cash: { withdrawn, itemized: Math.max(0, withdrawn - unlogged), everyday: unlogged, withdrawals },
  };
}

/** The trip's countries in itinerary order (first visit), each once. */
export function tripCountries(days: InsightDay[]): string[] {
  const seen: string[] = [];
  for (const v of countryVisits(days)) if (!seen.includes(v.code)) seen.push(v.code);
  return seen;
}

/** Prepaid amounts per country for days still ahead, in itinerary order. */
export function prepaidByCountry(slices: Slice[], days: InsightDay[], today: string): { code: string | null; amount: number }[] {
  const acc = new Map<string | null, number>();
  for (const s of slices) if (s.date > today) acc.set(s.country, (acc.get(s.country) ?? 0) + s.amount);
  const order: (string | null)[] = [...tripCountries(days), null];
  return order.filter((c) => (acc.get(c) ?? 0) > 0).map((code) => ({ code, amount: acc.get(code)! }));
}

// ---------------------------------------------------------------------------
// WHAT IS IN THE ANALYSIS (Hadar 26/11/2026). The insights can be narrowed by
// hand, each time anew: a date range, whether the preparations before the trip
// count (a Vietnam visa paid at home and marked Vietnam), whether what is paid
// ahead for days still to come counts, whole categories, and single expenses.
// Analysis only - nothing is written; the choice lives on this phone.

export type InsightFilter = {
  /** Inclusive ISO dates; null = open. Applies to the days and to every piece
   *  except the preparations, which have their own switch. */
  from: string | null;
  to: string | null;
  /** Pieces dated before the trip's first itinerary day. In a country's
   *  averages too when they carry that country (Hadar: "עלות ליום"). */
  includePrep: boolean;
  /** Pieces dated after today (paid in advance). */
  includePrepaid: boolean;
  /** Category ids left out; "" is the everyday cash line. */
  excludedCategories: string[];
  /** Expense ids left out. */
  excludedExpenses: string[];
};

export const DEFAULT_FILTER: InsightFilter = {
  from: null,
  to: null,
  includePrep: true,
  includePrepaid: true,
  excludedCategories: [],
  excludedExpenses: [],
};

export function isDefaultFilter(f: InsightFilter): boolean {
  return (
    f.from === null &&
    f.to === null &&
    f.includePrep &&
    f.includePrepaid &&
    f.excludedCategories.length === 0 &&
    f.excludedExpenses.length === 0
  );
}

/** How many choices differ from "everything". */
export function filterChanges(f: InsightFilter): number {
  return (
    (f.from !== null || f.to !== null ? 1 : 0) +
    (f.includePrep ? 0 : 1) +
    (f.includePrepaid ? 0 : 1) +
    f.excludedCategories.length +
    f.excludedExpenses.length
  );
}

/** The trip's first itinerary day with a country, or null. */
export function tripStart(days: InsightDay[]): string | null {
  let first: string | null = null;
  for (const d of days) if (d.country_code && (first === null || d.date < first)) first = d.date;
  return first;
}

/** A piece's line in "where the money went": everyday cash is "". */
export const sliceCategory = (s: Slice) => (s.kind === "everyday" ? "" : s.categoryId);

/** Is this piece a preparation (dated before the trip began)? */
export const isPrep = (s: Slice, start: string | null) => start !== null && s.date < start;

const inRange = (date: string, f: Pick<InsightFilter, "from" | "to">) =>
  (f.from === null || date >= f.from) && (f.to === null || date <= f.to);

/**
 * The pieces the filter keeps. `withExclusions` false keeps the excluded
 * categories and expenses - the panel still lists them, unticked.
 */
export function filterSlices(
  slices: Slice[],
  f: InsightFilter,
  start: string | null,
  today: string,
  withExclusions = true
): Slice[] {
  const cats = new Set(f.excludedCategories);
  const ids = new Set(f.excludedExpenses);
  return slices.filter((s) => {
    if (isPrep(s, start)) {
      if (!f.includePrep) return false;
    } else if (!inRange(s.date, f)) return false;
    if (!f.includePrepaid && s.date > today) return false;
    if (!withExclusions) return true;
    return !cats.has(sliceCategory(s)) && !ids.has(s.expenseId);
  });
}

/** Itinerary days inside the filter's range. */
export function filterDays<D extends InsightDay>(days: D[], f: Pick<InsightFilter, "from" | "to">): D[] {
  return f.from === null && f.to === null ? days : days.filter((d) => inRange(d.date, f));
}

/** Which withdrawals the cash picture counts: not excluded, in range. The
 *  cash expenses are still matched against every withdrawal, so leaving one
 *  out never moves the others' everyday cash. */
export function withdrawalFilter(f: InsightFilter, start: string | null, today: string) {
  const ids = new Set(f.excludedExpenses);
  const everydayOut = f.excludedCategories.includes("");
  return (e: Pick<InsightExpense, "id" | "spent_on">): boolean => {
    if (ids.has(e.id) || everydayOut) return false;
    if (start !== null && e.spent_on < start) return f.includePrep;
    if (!f.includePrepaid && e.spent_on > today) return false;
    return inRange(e.spent_on, f);
  };
}

export type ExpenseRow = { expenseId: string; date: string; amount: number; spread: boolean; prep: boolean };
export type CategoryRows = { categoryId: string; amount: number; rows: ExpenseRow[] };

/**
 * For the panel: every category in scope with its expenses (each counted by
 * its pieces in scope), largest first; the newest expense first inside one.
 */
export function categoryRows(slices: Slice[], scope: string | null, start: string | null): CategoryRows[] {
  const byCat = new Map<string, Map<string, ExpenseRow>>();
  for (const s of slices) {
    if (scope !== null && s.country !== scope) continue;
    const cat = sliceCategory(s);
    const rows = byCat.get(cat) ?? new Map<string, ExpenseRow>();
    byCat.set(cat, rows);
    const row = rows.get(s.expenseId);
    if (row) {
      row.amount += s.amount;
      if (s.date < row.date) row.date = s.date;
    } else {
      rows.set(s.expenseId, { expenseId: s.expenseId, date: s.date, amount: s.amount, spread: s.spread, prep: isPrep(s, start) });
    }
  }
  return [...byCat.entries()]
    .map(([categoryId, rows]) => {
      const list = [...rows.values()].map((r) => ({ ...r, amount: round2(r.amount) }));
      list.sort((a, b) => (a.date === b.date ? b.amount - a.amount : a.date < b.date ? 1 : -1));
      return { categoryId, amount: round2(list.reduce((t, r) => t + r.amount, 0)), rows: list };
    })
    .sort((a, b) => b.amount - a.amount);
}
