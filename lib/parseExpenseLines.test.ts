import { describe, expect, it } from "vitest";
import { parseExpenseLine, parseExpenseLines } from "./parseExpenseLines";

describe("parseExpenseLine", () => {
  it("reads 'description amount' with the default currency", () => {
    expect(parseExpenseLine("חיסונים 1200")).toEqual({
      raw: "חיסונים 1200",
      description: "חיסונים",
      amount: 1200,
      currency: "ILS",
    });
  });

  it("reads 'amount description' too", () => {
    const p = parseExpenseLine("1200 חיסונים");
    expect(p?.amount).toBe(1200);
    expect(p?.description).toBe("חיסונים");
  });

  it("picks up a written currency code and drops it from the description", () => {
    const p = parseExpenseLine("ביטוח נסיעות 3400 USD");
    expect(p?.amount).toBe(3400);
    expect(p?.currency).toBe("USD");
    expect(p?.description).toBe("ביטוח נסיעות");
  });

  it("picks up currency symbols on either side", () => {
    expect(parseExpenseLine("דרכונים ₪600")?.currency).toBe("ILS");
    expect(parseExpenseLine("$250 תיק גב")).toMatchObject({
      amount: 250,
      currency: "USD",
      description: "תיק גב",
    });
    expect(parseExpenseLine("מלון 1500 ฿")?.currency).toBe("THB");
  });

  it("handles thousands separators and decimals", () => {
    expect(parseExpenseLine("טיסות 12,500")?.amount).toBe(12500);
    expect(parseExpenseLine("קפה 12.5")?.amount).toBe(12.5);
  });

  it("takes the LAST number so counts in the description don't win", () => {
    const p = parseExpenseLine("חיסון 2 ילדים 900");
    expect(p?.amount).toBe(900);
    expect(p?.description).toBe("חיסון 2 ילדים");
  });

  it("returns null when there is no number", () => {
    expect(parseExpenseLine("סתם שורה")).toBeNull();
    expect(parseExpenseLine("   ")).toBeNull();
  });

  it("honours a non-ILS fallback currency", () => {
    expect(parseExpenseLine("lunch 40", "THB")?.currency).toBe("THB");
  });
});

describe("parseExpenseLines", () => {
  it("parses a pasted block and reports what it could not read", () => {
    const { lines, unparsed } = parseExpenseLines(
      ["חיסונים 1200", "", "ביטוח נסיעות 3400", "משהו בלי סכום", "דרכונים ₪600"].join("\n")
    );
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => l.amount)).toEqual([1200, 3400, 600]);
    expect(unparsed).toEqual(["משהו בלי סכום"]);
  });
});
