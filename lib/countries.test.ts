import { describe, expect, it } from "vitest";
import { allCountries, findCountry, flagEmoji, searchCountries } from "./countries";

describe("countries (F8)", () => {
  it("builds flags from the code", () => {
    expect(flagEmoji("VN")).toBe("🇻🇳");
    expect(flagEmoji("vn")).toBe("");
  });

  it("covers the trip's countries with Hebrew names", () => {
    for (const code of ["VN", "TH", "KH", "LA", "PH", "JP", "GE", "IL"]) {
      const c = findCountry(code);
      expect(c?.code).toBe(code);
      expect(c?.he).toMatch(/[֐-׿]/);
    }
    expect(allCountries().length).toBeGreaterThan(240);
  });

  it("finds by Hebrew spelling variants, English name and code", () => {
    expect(searchCountries("ויטנאם")[0].code).toBe("VN");
    expect(searchCountries("וייטנאם")[0].code).toBe("VN");
    expect(searchCountries("פיליפינים").map((c) => c.code)).toContain("PH");
    expect(searchCountries("japan")[0].code).toBe("JP");
    expect(searchCountries("ge")[0].code).toBe("GE");
  });

  it("puts the trip's countries first when the query is empty", () => {
    expect(searchCountries("", ["VN", "TH"]).slice(0, 2).map((c) => c.code)).toEqual(["VN", "TH"]);
  });
});
