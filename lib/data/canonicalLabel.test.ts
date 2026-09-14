import { describe, expect, it } from "vitest";
import { canonicalLabel } from "./placeOptions";

// The five countries actually in the bank after migration 00034.
const COUNTRIES = ["ויטנאם", "תאילנד", "יפן", "קמבודיה", "פיליפינים"];

describe("canonicalLabel", () => {
  it("snaps a doubled yod onto the spelling already in use", () => {
    // The real split: 54 options filed under וייטנאם, 339 under ויטנאם.
    expect(canonicalLabel("וייטנאם", COUNTRIES)).toBe("ויטנאם");
  });

  it("snaps a definite article onto the spelling already in use", () => {
    // The other real split: 26 under הפיליפינים, 75 under פיליפינים.
    expect(canonicalLabel("הפיליפינים", COUNTRIES)).toBe("פיליפינים");
  });

  it("works in the other direction too", () => {
    // Whichever spelling is in the bank is the one that wins, not a fixed one.
    expect(canonicalLabel("ויטנאם", ["וייטנאם"])).toBe("וייטנאם");
    expect(canonicalLabel("פיליפינים", ["הפיליפינים"])).toBe("הפיליפינים");
  });

  it("treats a doubled vav as the same name", () => {
    expect(canonicalLabel("טייוואן", ["טיוואן"])).toBe("טיוואן");
  });

  it("ignores surrounding and repeated whitespace", () => {
    expect(canonicalLabel("  ויטנאם  ", COUNTRIES)).toBe("ויטנאם");
    expect(canonicalLabel("קו לנטה", ["קו  לנטה"])).toBe("קו  לנטה");
  });

  it("leaves an exact match exactly alone", () => {
    for (const country of COUNTRIES) {
      expect(canonicalLabel(country, COUNTRIES)).toBe(country);
    }
  });

  it("returns a genuinely new country as typed", () => {
    // Adding Laos must not be silently renamed into one of the five.
    expect(canonicalLabel("לאוס", COUNTRIES)).toBe("לאוס");
    expect(canonicalLabel("Indonesia", COUNTRIES)).toBe("Indonesia");
  });

  it("never confuses two different countries", () => {
    expect(canonicalLabel("יפן", COUNTRIES)).toBe("יפן");
    expect(canonicalLabel("קמבודיה", COUNTRIES)).toBe("קמבודיה");
    expect(canonicalLabel("תאילנד", COUNTRIES)).toBe("תאילנד");
  });

  it("prefers the exact match when another label normalises the same", () => {
    // Both spellings still present (mid-migration): typing either keeps itself
    // rather than being renamed onto the other.
    const both = ["ויטנאם", "וייטנאם"];
    expect(canonicalLabel("ויטנאם", both)).toBe("ויטנאם");
    expect(canonicalLabel("וייטנאם", both)).toBe("וייטנאם");
  });

  it("matches case-insensitively for Latin-script names", () => {
    expect(canonicalLabel("vietnam", ["Vietnam"])).toBe("Vietnam");
  });

  it("works for areas, which have the same free-text problem", () => {
    const areas = ["הוי אן", "האנוי", "טאם קוק"];
    expect(canonicalLabel("הוי אן", areas)).toBe("הוי אן");
    expect(canonicalLabel("האנוי", areas)).toBe("האנוי");
    // "הנוי" is the article-stripped form of "האנוי"? No - different letters.
    // It must NOT be snapped, because the rule only removes a leading ה.
    expect(canonicalLabel("הנוי", areas)).toBe("הנוי");
  });

  it("passes empty and missing values straight through", () => {
    expect(canonicalLabel("", COUNTRIES)).toBe("");
    expect(canonicalLabel(null, COUNTRIES)).toBeNull();
    expect(canonicalLabel(undefined, COUNTRIES)).toBeUndefined();
    expect(canonicalLabel("   ", COUNTRIES)).toBe("   ");
  });

  it("is a no-op against an empty bank", () => {
    expect(canonicalLabel("ויטנאם", [])).toBe("ויטנאם");
  });
});
