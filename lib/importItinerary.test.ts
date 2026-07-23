import { describe, expect, it } from "vitest";
import { parseDateCell, parseTimeCell } from "./importItinerary";

describe("importItinerary date parsing", () => {
  it("parses ISO dates", () => {
    expect(parseDateCell("2026-08-10")).toBe("2026-08-10");
    expect(parseDateCell("2026-8-5")).toBe("2026-08-05");
  });

  it("parses Israeli DD/MM/YYYY (and . or - separators, 2-digit year)", () => {
    expect(parseDateCell("10/08/2026")).toBe("2026-08-10");
    expect(parseDateCell("5.8.2026")).toBe("2026-08-05");
    expect(parseDateCell("10-08-26")).toBe("2026-08-10");
  });

  it("parses Excel serial numbers", () => {
    // 2026-08-10 is serial 46244
    expect(parseDateCell(46244)).toBe("2026-08-10");
  });

  it("returns null for junk", () => {
    expect(parseDateCell("")).toBeNull();
    expect(parseDateCell("hello")).toBeNull();
  });
});

describe("importItinerary time parsing", () => {
  it("parses HH:MM text", () => {
    expect(parseTimeCell("9:00")).toBe("09:00");
    expect(parseTimeCell("14:30")).toBe("14:30");
    expect(parseTimeCell("09:05:00")).toBe("09:05");
  });

  it("parses Excel time fractions", () => {
    expect(parseTimeCell(0.375)).toBe("09:00"); // 9/24
    expect(parseTimeCell(0.5)).toBe("12:00");
  });

  it("returns null for non-times", () => {
    expect(parseTimeCell("")).toBeNull();
    expect(parseTimeCell("morning")).toBeNull();
  });
});
