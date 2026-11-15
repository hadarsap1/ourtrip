import { describe, expect, it } from "vitest";
import { countSince, newLabel, pickQuote } from "./guestVisit";

describe("countSince", () => {
  const visit = Date.parse("2026-11-10T08:00:00Z");
  it("counts only what came after the last visit", () => {
    expect(countSince(["2026-11-09T10:00:00Z", "2026-11-10T09:00:00Z", "2026-11-12T00:00:00Z"], visit)).toBe(2);
  });
  it("is zero with no last visit, and ignores missing or broken stamps", () => {
    expect(countSince(["2026-11-12T00:00:00Z"], null)).toBe(0);
    expect(countSince([null, undefined, "oops", "2026-11-12T00:00:00Z"], visit)).toBe(1);
  });
});

describe("newLabel", () => {
  it("says one, many, or nothing", () => {
    expect(newLabel(0, "עדכון חדש", "{n} עדכונים חדשים")).toBeNull();
    expect(newLabel(1, "עדכון חדש", "{n} עדכונים חדשים")).toBe("עדכון חדש");
    expect(newLabel(6, "עדכון חדש", "{n} עדכונים חדשים")).toBe("6 עדכונים חדשים");
  });
});

describe("pickQuote", () => {
  const long = { quote: "א".repeat(120) };
  const short = { quote: "למה הים מלוח?" };
  it("prefers the newest quote that fits the card", () => {
    expect(pickQuote([long, short])).toBe(short);
    expect(pickQuote([short, long])).toBe(short);
  });
  it("falls back to the newest, and to nothing", () => {
    expect(pickQuote([long])).toBe(long);
    expect(pickQuote([])).toBeNull();
  });
});
