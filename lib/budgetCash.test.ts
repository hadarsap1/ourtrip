import { describe, expect, it } from "vitest";
import { cashWallets, cashWithdrawalUses, countedExpenses } from "./budget";

type E = {
  id: string;
  amount: number;
  currency: string;
  amount_ils: number;
  spent_on: string;
  is_cash_withdrawal: boolean;
  paid_in_cash: boolean;
};

const exp = (id: string, amount: number, currency: string, amount_ils: number, extra: Partial<E> = {}): E => ({
  id,
  amount,
  currency,
  amount_ils,
  spent_on: "2026-11-10",
  is_cash_withdrawal: false,
  paid_in_cash: false,
  ...extra,
});
const atm = (id: string, amount: number, currency: string, amount_ils: number, spent_on = "2026-11-10") =>
  exp(id, amount, currency, amount_ils, { is_cash_withdrawal: true, spent_on });
const cash = (id: string, amount: number, currency: string, amount_ils: number) =>
  exp(id, amount, currency, amount_ils, { paid_in_cash: true });

const sum = (xs: { amount_ils: number }[]) => Math.round(xs.reduce((s, e) => s + e.amount_ils, 0) * 100) / 100;

describe("countedExpenses", () => {
  it("leaves a list without withdrawals untouched", () => {
    const list = [exp("a", 100, "ILS", 100), cash("b", 50, "ILS", 50)];
    expect(countedExpenses(list)).toBe(list);
  });

  it("counts cash once: the withdrawal counts only what is left of it", () => {
    const list = [atm("w", 10000, "JPY", 250), cash("ramen", 2000, "JPY", 50), exp("card", 200, "ILS", 200)];
    const counted = countedExpenses(list);
    expect(counted.find((e) => e.id === "w")!.amount_ils).toBe(200);
    expect(sum(counted)).toBe(450);
  });

  it("uses up the oldest withdrawal first, across several", () => {
    const list = [
      atm("w2", 5000, "JPY", 125, "2026-11-12"),
      atm("w1", 5000, "JPY", 125, "2026-11-10"),
      cash("a", 6000, "JPY", 150),
    ];
    const uses = cashWithdrawalUses(list);
    expect(uses.get("w1")).toEqual({ withdrawn: 5000, used: 5000, left: 0, countedIls: 0 });
    expect(uses.get("w2")).toEqual({ withdrawn: 5000, used: 1000, left: 4000, countedIls: 100 });
    expect(sum(countedExpenses(list))).toBe(250);
  });

  it("never counts a withdrawal below zero: cash beyond it counts in full", () => {
    const list = [atm("w", 1000, "JPY", 25), cash("p", 3000, "JPY", 75)];
    expect(sum(countedExpenses(list))).toBe(75);
  });

  it("keeps currencies apart: a new country is a new wallet", () => {
    const list = [atm("jp", 10000, "JPY", 250), atm("vn", 1000000, "VND", 150), cash("pho", 100000, "VND", 15)];
    const uses = cashWithdrawalUses(list);
    expect(uses.get("jp")!.used).toBe(0);
    expect(uses.get("vn")!.left).toBe(900000);
  });

  it("does not change the input", () => {
    const list = [atm("w", 1000, "ILS", 1000), cash("p", 400, "ILS", 400)];
    countedExpenses(list);
    expect(list[0].amount_ils).toBe(1000);
  });
});

describe("cashWallets", () => {
  it("reports each currency's wallet, newest withdrawal first, never below zero", () => {
    const list = [
      atm("jp", 10000, "JPY", 250, "2026-11-01"),
      cash("a", 12000, "JPY", 300),
      atm("vn1", 2000000, "VND", 300, "2026-11-08"),
      atm("vn2", 1000000, "VND", 150, "2026-11-11"),
      cash("b", 450000.5, "VND", 67.5),
      cash("c", 10, "USD", 37),
    ];
    expect(cashWallets(list)).toEqual([
      { currency: "VND", withdrawn: 3000000, spent: 450000.5, left: 2549999.5, withdrawals: 2, lastWithdrawal: "2026-11-11" },
      { currency: "JPY", withdrawn: 10000, spent: 12000, left: 0, withdrawals: 1, lastWithdrawal: "2026-11-01" },
    ]);
  });
});
