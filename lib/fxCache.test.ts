import { describe, expect, it } from "vitest";
import { cachedFxRate, readFxStore, saveFxRate } from "./fxCache";

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe("offline FX cache (Phase 2.4)", () => {
  it("starts empty and survives corrupt data", () => {
    const s = mem();
    expect(readFxStore(s)).toEqual({ rates: {}, updatedAt: null });
    s.setItem("ourtrip-fx", "{nope");
    expect(readFxStore(s).rates).toEqual({});
  });

  it("stores rates with a stamp and keeps the newest day", () => {
    const s = mem();
    saveFxRate("VND", 0.00015, "2026-11-02", new Date("2026-11-02T08:00:00Z"), s);
    saveFxRate("VND", 0.00014, "2026-11-01", new Date("2026-11-02T09:00:00Z"), s); // older day ignored
    expect(cachedFxRate("VND", s)).toEqual({ rate: 0.00015, day: "2026-11-02" });
    expect(readFxStore(s).updatedAt).toBe("2026-11-02T08:00:00.000Z");
    saveFxRate("VND", 0.00016, "2026-11-03", new Date("2026-11-03T08:00:00Z"), s);
    expect(cachedFxRate("VND", s)?.rate).toBe(0.00016);
  });

  it("ignores bad rates and ILS, and always knows ILS", () => {
    const s = mem();
    saveFxRate("THB", 0, "2026-11-02", new Date(), s);
    saveFxRate("ILS", 2, "2026-11-02", new Date(), s);
    expect(readFxStore(s).rates).toEqual({});
    expect(cachedFxRate("ILS", s)?.rate).toBe(1);
    expect(cachedFxRate("THB", s)).toBeNull();
  });
});
