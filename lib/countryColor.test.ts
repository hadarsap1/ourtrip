import { describe, expect, it } from "vitest";
import { countryTone } from "./countryColor";

describe("countryTone", () => {
  it("gives a known country its own variables, in any letter case", () => {
    expect(countryTone("VN")).toEqual({ bg: "var(--country-vn)", on: "var(--country-vn-on)", soft: "var(--country-vn-soft)" });
    expect(countryTone(" jp ").bg).toBe("var(--country-jp)");
  });

  it("falls back to the brand for a country without a token, or none", () => {
    for (const code of ["FR", "", null, undefined]) {
      expect(countryTone(code)).toEqual({ bg: "var(--brand)", on: "var(--brand-contrast)", soft: "var(--brand-soft)" });
    }
  });
});
