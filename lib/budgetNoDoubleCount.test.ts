// Hadar 26/11/2026: "make sure there is no double counting in any case" -
// cash withdrawals vs expenses paid from that cash, on every sum the app
// shows, with and without the analysis filter.
import { describe, expect, it } from "vitest";
import { countedExpenses } from "./budget";
import {
  DEFAULT_FILTER,
  expenseSlices,
  filterSlices,
  scopeInsights,
  tripStart,
  withdrawalFilter,
  type InsightExpense,
  type InsightFilter,
} from "./budgetInsights";

const days = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"].map((date) => ({ date, country_code: "VN" }));
const today = "2026-11-04";
const categories = [
  { id: "food", key: "food" },
  { id: "cash", key: "cash" },
];
const start = tripStart(days);
let n = 0;
/** amount in ILS = amount (rate 1) unless amount_ils is given. */
const e = (p: Partial<InsightExpense> & { amount: number }): InsightExpense => ({
  id: `x${++n}`,
  currency: "VND",
  amount_ils: p.amount,
  spent_on: "2026-11-02",
  category_id: "food",
  booking_id: null,
  country_code: null,
  is_cash_withdrawal: false,
  paid_in_cash: false,
  ...p,
});
const atm = (amount: number, spent_on = "2026-11-01", currency = "VND") =>
  e({ amount, spent_on, currency, is_cash_withdrawal: true, category_id: "cash" });
const cash = (amount: number, spent_on = "2026-11-02", currency = "VND") => e({ amount, spent_on, currency, paid_in_cash: true });
const card = (amount: number, spent_on = "2026-11-02") => e({ amount, spent_on, currency: "ILS" });

const mainTotal = (list: InsightExpense[]) => countedExpenses(list).reduce((s, x) => s + x.amount_ils, 0);
const insights = (list: InsightExpense[], f: InsightFilter = DEFAULT_FILTER, scope: string | null = null) =>
  scopeInsights(filterSlices(expenseSlices(list, days, []), f, start, today), list, days, categories, [], scope, today, withdrawalFilter(f, start, today));

describe("no double counting: withdrawals and cash purchases", () => {
  it("a withdrawal and the purchases paid from it count once", () => {
    const list = [atm(1000), cash(300), cash(200)];
    expect(mainTotal(list)).toBe(1000);
    const r = insights(list);
    expect(r.total).toBe(1000);
    expect(r.everyday).toBe(500);
    expect(r.cash).toEqual({ withdrawn: 1000, itemized: 500, everyday: 500, withdrawals: 1 });
  });

  it("purchases beyond the withdrawals: the purchases count, the withdrawal adds nothing", () => {
    const list = [atm(1000), cash(700), cash(600)];
    expect(mainTotal(list)).toBe(1300);
    expect(insights(list).total).toBe(1300);
  });

  it("each currency is its own wallet", () => {
    const list = [atm(1000, "2026-11-01", "VND"), atm(400, "2026-11-01", "USD"), cash(300, "2026-11-02", "VND"), cash(400, "2026-11-02", "USD")];
    expect(mainTotal(list)).toBe(1400);
    expect(insights(list).total).toBe(1400);
  });

  it("card payments are never touched by the cash", () => {
    const list = [atm(1000), cash(300), card(250)];
    expect(insights(list).total).toBe(1250);
  });

  it("the categories add up to the total, never more", () => {
    const list = [atm(1000), cash(300), cash(200), card(250)];
    const r = insights(list);
    expect(r.byCategory.reduce((s, c) => s + c.amount, 0)).toBe(r.total);
  });

  it("the main screen and the insights agree", () => {
    const list = [atm(1000), atm(500, "2026-11-03"), cash(300), cash(900, "2026-11-04"), card(250)];
    expect(insights(list).total).toBeCloseTo(mainTotal(list));
  });
});

describe("no double counting under the analysis filter", () => {
  const w = atm(1000);
  const a = cash(300);
  const b = cash(200, "2026-11-03");
  const list = [w, a, b];

  it("leaving out a cash purchase does not return its cash to the everyday line", () => {
    const r = insights(list, { ...DEFAULT_FILTER, excludedExpenses: [a.id] });
    expect(r.total).toBe(700);
    expect(r.everyday).toBe(500);
  });

  it("leaving out the withdrawal leaves only the purchases", () => {
    expect(insights(list, { ...DEFAULT_FILTER, excludedExpenses: [w.id] }).total).toBe(500);
    expect(insights(list, { ...DEFAULT_FILTER, excludedCategories: [""] }).total).toBe(500);
  });

  it("a date range splits them without overlap", () => {
    const day = (d: string) => insights(list, { ...DEFAULT_FILTER, from: d, to: d }).total;
    const parts = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"].map(day);
    expect(parts).toEqual([500, 300, 200, 0]);
    expect(parts.reduce((s, x) => s + x, 0)).toBe(insights(list).total);
  });

  it("random trips: total equals the main screen, categories add up, ranges partition", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
    for (let trip = 0; trip < 200; trip++) {
      const list: InsightExpense[] = [];
      for (let i = 0; i < 12; i++) {
        const date = pick(days).date;
        const cur = pick(["VND", "USD"]);
        const amount = Math.round(rnd() * 1000) + 1;
        const kind = rnd();
        list.push(kind < 0.3 ? atm(amount, date, cur) : kind < 0.7 ? cash(amount, date, cur) : card(amount, date));
      }
      const r = insights(list);
      expect(r.total).toBeCloseTo(mainTotal(list), 6);
      expect(r.byCategory.reduce((s, c) => s + c.amount, 0)).toBeCloseTo(r.total, 6);
      const byDay = days.map((d) => insights(list, { ...DEFAULT_FILTER, from: d.date, to: d.date }).total);
      expect(byDay.reduce((s, x) => s + x, 0)).toBeCloseTo(r.total, 6);
      // never more than what really left the family: per currency the larger
      // of withdrawn and spent-in-cash, plus the card payments
      const real = ["VND", "USD"].reduce((s, cur) => {
        const wd = list.filter((x) => x.currency === cur && x.is_cash_withdrawal).reduce((t, x) => t + x.amount, 0);
        const sp = list.filter((x) => x.currency === cur && x.paid_in_cash).reduce((t, x) => t + x.amount, 0);
        return s + Math.max(wd, sp);
      }, list.filter((x) => x.currency === "ILS").reduce((t, x) => t + x.amount, 0));
      expect(r.total).toBeCloseTo(real, 6);
    }
  });
});

describe("asks about expenses that may have come from the cash", () => {
  it("flags a foreign-currency expense on or after a withdrawal in that currency, not marked cash", async () => {
    const { maybeCashExpenseIds } = await import("./budget");
    const w = atm(1000, "2026-11-02");
    const before = e({ amount: 50, spent_on: "2026-11-01" });
    const after = e({ amount: 50, spent_on: "2026-11-03" });
    const marked = cash(50, "2026-11-03");
    const booked = e({ amount: 50, spent_on: "2026-11-03", booking_id: "b1" });
    const shekel = card(50, "2026-11-03");
    const otherCurrency = e({ amount: 50, spent_on: "2026-11-03", currency: "JPY" });
    const ids = maybeCashExpenseIds([w, before, after, marked, booked, shekel, otherCurrency]);
    expect([...ids]).toEqual([after.id]);
  });
});
