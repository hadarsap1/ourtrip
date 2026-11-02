import { describe, expect, it } from "vitest";
import { cashWithdrawalSplits, countedExpenses } from "./budget";

const exp = (
  id: string,
  amount_ils: number,
  extra: { is_cash_withdrawal?: boolean; paid_from_expense_id?: string | null } = {}
) => ({ id, amount_ils, is_cash_withdrawal: false, paid_from_expense_id: null, ...extra });

const sum = (xs: { amount_ils: number }[]) => xs.reduce((s, e) => s + e.amount_ils, 0);

describe("countedExpenses", () => {
  it("leaves a list without withdrawals untouched", () => {
    const list = [exp("a", 100), exp("b", 50)];
    expect(countedExpenses(list)).toBe(list);
  });

  it("counts a purchase paid from cash once, not twice", () => {
    const list = [
      exp("w", 3000, { is_cash_withdrawal: true }),
      exp("suitcases", 1000, { paid_from_expense_id: "w" }),
      exp("card", 200),
    ];
    const counted = countedExpenses(list);
    expect(sum(counted)).toBe(3200);
    expect(counted.find((e) => e.id === "w")!.amount_ils).toBe(2000);
    expect(counted.find((e) => e.id === "suitcases")!.amount_ils).toBe(1000);
  });

  it("never counts a withdrawal below zero", () => {
    const list = [
      exp("w", 500, { is_cash_withdrawal: true }),
      exp("p", 800, { paid_from_expense_id: "w" }),
    ];
    expect(sum(countedExpenses(list))).toBe(800);
  });

  it("ignores a link to an expense that is not a withdrawal", () => {
    const list = [exp("x", 300), exp("p", 100, { paid_from_expense_id: "x" })];
    expect(sum(countedExpenses(list))).toBe(400);
  });

  it("does not change the input", () => {
    const list = [exp("w", 1000, { is_cash_withdrawal: true }), exp("p", 400, { paid_from_expense_id: "w" })];
    countedExpenses(list);
    expect(list[0].amount_ils).toBe(1000);
  });
});

describe("cashWithdrawalSplits", () => {
  it("reports withdrawn, itemized, left and count per withdrawal", () => {
    const list = [
      exp("w1", 3000, { is_cash_withdrawal: true }),
      exp("w2", 1000, { is_cash_withdrawal: true }),
      exp("a", 1000.1, { paid_from_expense_id: "w1" }),
      exp("b", 200.2, { paid_from_expense_id: "w1" }),
    ];
    const splits = cashWithdrawalSplits(list);
    expect(splits.get("w1")).toEqual({ withdrawn: 3000, itemized: 1200.3, left: 1799.7, count: 2 });
    expect(splits.get("w2")).toEqual({ withdrawn: 1000, itemized: 0, left: 1000, count: 0 });
  });
});
