import { describe, expect, it } from "vitest";
import { formatDate, formatShortDate, formatMoney, formatTime, todayISO } from "./format";

describe("format", () => {
  it("formats dates as DD/MM/YYYY (hard rule #4)", () => {
    expect(formatDate("2026-10-24")).toBe("24/10/2026");
    expect(formatShortDate("2026-10-24")).toBe("24/10");
  });

  it("trims time to HH:MM", () => {
    expect(formatTime("14:30:00")).toBe("14:30");
    expect(formatTime("09:05")).toBe("09:05");
  });

  it("formats ILS with the shekel sign and other currencies with a code", () => {
    expect(formatMoney(1234.5, "ILS")).toContain("₪");
    expect(formatMoney(1234.5, "ILS")).not.toContain("ILS");
    const eur = formatMoney(50, "EUR");
    expect(eur).toContain("EUR");
    expect(eur).not.toContain("₪");
  });

  it("todayISO returns a YYYY-MM-DD string", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
