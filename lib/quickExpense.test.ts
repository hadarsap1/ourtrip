import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ getSupabase: () => null }));
const { currencyChips, pressKey } = await import("@/components/capture/QuickExpenseSheet");

describe("quick expense helpers (1.7)", () => {
  it("orders currency chips: last used, local, USD, ILS - no duplicates", () => {
    expect(currencyChips("VND", "THB")).toEqual(["VND", "THB", "USD", "ILS"]);
    expect(currencyChips("ILS", "VND")).toEqual(["ILS", "VND", "USD"]);
    expect(currencyChips(null, null)).toEqual(["USD", "ILS"]);
  });

  it("keeps the keypad amount a valid number", () => {
    expect(pressKey("", "5")).toBe("5");
    expect(pressKey("0", "7")).toBe("7");
    expect(pressKey("12", ".")).toBe("12.");
    expect(pressKey("12.", ".")).toBe("12.");
    expect(pressKey("12.5", "0")).toBe("12.50");
    expect(pressKey("12.50", "1")).toBe("12.50");
    expect(pressKey("125", "⌫")).toBe("12");
    expect(pressKey("", ".")).toBe("0.");
  });
});
