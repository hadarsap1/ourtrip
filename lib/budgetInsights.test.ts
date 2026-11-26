import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTER,
  categoryRows,
  expenseSlices,
  filterChanges,
  filterDays,
  filterSlices,
  prepaidByCountry,
  scopeInsights,
  tripCountries,
  tripStart,
  withdrawalFilter,
  type InsightExpense,
} from "./budgetInsights";

// Vietnam 01-05/11, Japan 06-08/11; today 03/11.
const days = [
  ...["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"].map((date) => ({ date, country_code: "VN" })),
  ...["2026-11-06", "2026-11-07", "2026-11-08"].map((date) => ({ date, country_code: "JP" })),
];
const today = "2026-11-03";
const categories = [
  { id: "lodging", key: "lodging" },
  { id: "food", key: "food" },
  { id: "attractions", key: "attractions" },
];
const bookings = [
  { id: "b-jp-hotel", type: "hotel" as const, start_date: "2026-11-06", end_date: "2026-11-09" },
  { id: "b-vn-hotel", type: "hotel" as const, start_date: "2026-11-01", end_date: "2026-11-05" },
  { id: "b-jp-park", type: "attraction" as const, start_date: "2026-11-07", end_date: null },
];
let n = 0;
const exp = (p: Partial<InsightExpense> & { amount_ils: number }): InsightExpense => ({
  id: `e${++n}`,
  amount: p.amount_ils,
  currency: "ILS",
  spent_on: "2026-11-02",
  category_id: "food",
  booking_id: null,
  country_code: null,
  is_cash_withdrawal: false,
  paid_in_cash: false,
  ...p,
});

describe("expenseSlices", () => {
  it("places a booking by its dates, not the day it was paid", () => {
    const e = exp({ amount_ils: 500, booking_id: "b-jp-park", category_id: "attractions" });
    const [s] = expenseSlices([e], days, bookings);
    expect(s).toMatchObject({ date: "2026-11-07", country: "JP" });
  });

  it("spreads a hotel over its nights, adding up exactly", () => {
    const e = exp({ amount_ils: 1000, booking_id: "b-jp-hotel", category_id: "lodging" });
    const s = expenseSlices([e], days, bookings);
    expect(s.map((x) => x.date)).toEqual(["2026-11-06", "2026-11-07", "2026-11-08"]);
    expect(s.every((x) => x.country === "JP" && x.spread)).toBe(true);
    expect(s.reduce((a, x) => a + x.amount, 0)).toBeCloseTo(1000, 2);
  });

  it("the expense's own country wins", () => {
    const e = exp({ amount_ils: 300, country_code: "JP" });
    expect(expenseSlices([e], days, bookings)[0]).toMatchObject({ date: "2026-11-02", country: "JP" });
  });

  it("a day with no country leaves the piece without one", () => {
    const e = exp({ amount_ils: 200, spent_on: "2026-10-01" });
    expect(expenseSlices([e], days, bookings)[0].country).toBeNull();
  });

  it("a withdrawal counts only what is left of it, as everyday", () => {
    const w = exp({ amount_ils: 1000, is_cash_withdrawal: true });
    const p = exp({ amount_ils: 400, paid_in_cash: true, category_id: "attractions" });
    const s = expenseSlices([w, p], days, bookings);
    expect(s.find((x) => x.expenseId === w.id)).toMatchObject({ amount: 600, kind: "everyday" });
    expect(s.find((x) => x.expenseId === p.id)).toMatchObject({ amount: 400, kind: "specific" });
  });
});

describe("scopeInsights", () => {
  const w = exp({ amount_ils: 900, is_cash_withdrawal: true, spent_on: "2026-11-01" });
  const bigCash = exp({ amount_ils: 300, paid_in_cash: true, category_id: "attractions" });
  const vnHotel = exp({ amount_ils: 800, booking_id: "b-vn-hotel", category_id: "lodging", spent_on: "2026-10-15" });
  const jpHotel = exp({ amount_ils: 1200, booking_id: "b-jp-hotel", category_id: "lodging", spent_on: "2026-11-02" });
  const prep = exp({ amount_ils: 100, spent_on: "2026-10-01" });
  const all = [w, bigCash, vnHotel, jpHotel, prep];
  const slices = expenseSlices(all, days, bookings);
  const vn = scopeInsights(slices, all, days, categories, bookings, "VN", today);
  const jp = scopeInsights(slices, all, days, categories, bookings, "JP", today);
  const trip = scopeInsights(slices, all, days, categories, bookings, null, today);

  it("Vietnam does not carry the Japan hotel paid from Vietnam", () => {
    expect(vn.total).toBeCloseTo(600 + 300 + 800, 2);
    expect(jp.total).toBeCloseTo(1200, 2);
    expect(jp.prepaid).toBeCloseTo(1200, 2);
    expect(jp.perDay).toBeNull();
  });

  it("splits Vietnam into used and paid ahead", () => {
    // hotel nights 01-04/11: three used, one ahead
    expect(vn.prepaid).toBeCloseTo(200, 2);
    expect(vn.daysSoFar).toBe(3);
    expect(vn.daysPlanned).toBe(5);
    expect(vn.perDay).toBeCloseTo((600 + 300 + 600) / 3, 2);
  });

  it("everyday per day is the unitemized cash", () => {
    expect(vn.everyday).toBe(600);
    expect(vn.everydayPerDay).toBe(200);
    expect(vn.cash).toEqual({ withdrawn: 900, itemized: 300, everyday: 600, withdrawals: 1 });
    expect(jp.cash.withdrawals).toBe(0);
  });

  it("lodging per night over the nights the hotel covers", () => {
    expect(vn.lodgingPerNight).toBe(200);
    expect(vn.lodgingNights).toBe(4);
    expect(jp.lodgingPerNight).toBe(400);
  });

  it("categories with everyday cash as its own line", () => {
    expect(vn.byCategory.map((c) => c.categoryId)).toEqual(["lodging", "", "attractions"]);
    expect(vn.byCategory.reduce((a, c) => a + c.pct, 0)).toBe(100);
  });

  it("whole trip keeps prep without a country, out of the per-day average", () => {
    expect(trip.total).toBeCloseTo(3000, 2);
    expect(trip.noCountry).toBe(100);
    expect(trip.perDay).toBeCloseTo(vn.perDay!, 2);
  });

  it("prepaid per country in itinerary order", () => {
    expect(prepaidByCountry(slices, days, today)).toEqual([
      { code: "VN", amount: 200 },
      { code: "JP", amount: 1200 },
    ]);
    expect(tripCountries(days)).toEqual(["VN", "JP"]);
  });

  it("a lodging expense without dates is measured against the uncovered nights", () => {
    const desk = exp({ amount_ils: 300, category_id: "lodging", spent_on: "2026-11-02" });
    const list = [desk];
    const s = scopeInsights(expenseSlices(list, days, bookings), list, days, categories, bookings, "VN", today);
    // 01-03/11 so far, none covered by a hotel booking
    expect(s.lodgingNights).toBe(3);
    expect(s.lodgingPerNight).toBe(100);
  });
});

describe("analysis filter (Hadar 26/11/2026)", () => {
  const visa = exp({ amount_ils: 400, spent_on: "2026-10-01", country_code: "VN", category_id: "attractions" });
  const lunch = exp({ amount_ils: 100, spent_on: "2026-11-02" });
  const dinner = exp({ amount_ils: 200, spent_on: "2026-11-03" });
  const ahead = exp({ amount_ils: 900, booking_id: "b-jp-park", category_id: "attractions" });
  const all = [visa, lunch, dinner, ahead];
  const slices = expenseSlices(all, days, bookings);
  const start = tripStart(days);
  const vn = (f = DEFAULT_FILTER) =>
    scopeInsights(filterSlices(slices, f, start, today), all, filterDays(days, f), categories, bookings, "VN", today, withdrawalFilter(f, start, today));

  it("a visa paid at home and marked Vietnam is in Vietnam's cost per day, and can be left out", () => {
    expect(start).toBe("2026-11-01");
    expect(vn().perDay).toBeCloseTo((400 + 100 + 200) / 3);
    expect(vn({ ...DEFAULT_FILTER, includePrep: false }).perDay).toBeCloseTo(300 / 3);
  });

  it("a date range narrows the pieces and the days", () => {
    const f = { ...DEFAULT_FILTER, includePrep: false, from: "2026-11-03", to: "2026-11-03" };
    const r = vn(f);
    expect(r.total).toBe(200);
    expect(r.daysSoFar).toBe(1);
    expect(r.perDay).toBe(200);
  });

  it("the preparations keep their own switch inside a range", () => {
    const f = { ...DEFAULT_FILTER, from: "2026-11-03", to: "2026-11-03" };
    expect(vn(f).total).toBe(600);
  });

  it("leaves out single expenses, whole categories and what is paid ahead", () => {
    expect(vn({ ...DEFAULT_FILTER, excludedExpenses: [lunch.id] }).total).toBe(600);
    expect(vn({ ...DEFAULT_FILTER, excludedCategories: ["food"] }).total).toBe(400);
    const whole = (f = DEFAULT_FILTER) => scopeInsights(filterSlices(slices, f, start, today), all, days, categories, bookings, null, today);
    expect(whole().total).toBe(1600);
    expect(whole({ ...DEFAULT_FILTER, includePrepaid: false }).total).toBe(700);
  });

  it("lists excluded expenses for the panel, by category, newest first", () => {
    const f = { ...DEFAULT_FILTER, excludedExpenses: [lunch.id] };
    const rows = categoryRows(filterSlices(slices, f, start, today, false), "VN", start);
    const food = rows.find((r) => r.categoryId === "food")!;
    expect(food.amount).toBe(300);
    expect(food.rows.map((r) => r.expenseId)).toEqual([dinner.id, lunch.id]);
    expect(rows.find((r) => r.categoryId === "attractions")!.rows[0]).toMatchObject({ expenseId: visa.id, prep: true });
  });

  it("counts the changes", () => {
    expect(filterChanges(DEFAULT_FILTER)).toBe(0);
    expect(filterChanges({ ...DEFAULT_FILTER, from: "2026-11-01", to: "2026-11-02", includePrep: false, excludedExpenses: ["a", "b"] })).toBe(4);
  });

  it("an excluded withdrawal leaves the cash picture", () => {
    const atm = exp({ amount_ils: 500, is_cash_withdrawal: true, spent_on: "2026-11-02" });
    const list = [atm, lunch];
    const s2 = expenseSlices(list, days, bookings);
    const f = { ...DEFAULT_FILTER, excludedExpenses: [atm.id] };
    const r = scopeInsights(filterSlices(s2, f, start, today), list, days, categories, bookings, "VN", today, withdrawalFilter(f, start, today));
    expect(r.cash.withdrawals).toBe(0);
    expect(r.everyday).toBe(0);
  });
});
