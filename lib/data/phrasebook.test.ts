import { describe, expect, it } from "vitest";
import { filterEntries, searchLanguages } from "./phrasebook";

// The phrasebook is offline-critical, so search runs over the rows already in
// hand. What it has to match is everything you might half-remember.

const entries = [
  {
    category: "ברכות",
    phrase_he: "שלום",
    phrase_local: "こんにちは",
    phonetic_he: "קונ'ניצ'יווה",
  },
  {
    category: "נימוסים",
    phrase_he: "סליחה",
    phrase_local: "すみません",
    phonetic_he: "סומימאסן",
  },
  {
    category: "חירום ובריאות",
    phrase_he: "צריך רופא",
    phrase_local: "医者が必要です",
    phonetic_he: "אישה גא היצుיו דס",
  },
];

describe("filterEntries", () => {
  it("returns everything for an empty query", () => {
    expect(filterEntries(entries, "")).toHaveLength(3);
    expect(filterEntries(entries, "   ")).toHaveLength(3);
  });

  it("matches the Hebrew phrase", () => {
    expect(filterEntries(entries, "סליחה").map((e) => e.phrase_he)).toEqual([
      "סליחה",
    ]);
  });

  it("matches the transliteration, which is how you remember a phrase", () => {
    expect(filterEntries(entries, "סומימא").map((e) => e.phrase_he)).toEqual([
      "סליחה",
    ]);
  });

  it("matches the native script", () => {
    expect(filterEntries(entries, "医者").map((e) => e.phrase_he)).toEqual([
      "צריך רופא",
    ]);
  });

  it("matches the category, so a whole topic can be pulled up at once", () => {
    expect(filterEntries(entries, "חירום").map((e) => e.phrase_he)).toEqual([
      "צריך רופא",
    ]);
  });

  it("ignores case and surrounding spaces", () => {
    const latin = [
      { ...entries[0], phonetic_he: "Konnichiwa" },
    ];
    expect(filterEntries(latin, "  KONNICHI ")).toHaveLength(1);
  });

  it("returns nothing when nothing matches, rather than everything", () => {
    expect(filterEntries(entries, "זזזזז")).toEqual([]);
  });

  it("survives an entry with no transliteration", () => {
    const noPhonetic = [{ ...entries[0], phonetic_he: null }];
    expect(filterEntries(noPhonetic, "שלום")).toHaveLength(1);
    expect(filterEntries(noPhonetic, "קונ")).toHaveLength(0);
  });
});

// Adding a language used to mean typing an ISO 639 code. Nobody knows that
// Khmer is "km" or Georgian is "ka", and this trip needs both.
describe("searchLanguages", () => {
  it("puts this trip's six languages first when nothing is typed", () => {
    expect(searchLanguages("").slice(0, 6).map((l) => l.code)).toEqual([
      "vi", "th", "km", "tl", "ja", "ka",
    ]);
  });

  it("finds a language by a prefix of its Hebrew name", () => {
    expect(searchLanguages("חמר").map((l) => l.code)).toContain("km");
    expect(searchLanguages("גאורג").map((l) => l.code)).toContain("ka");
    expect(searchLanguages("וייטנ").map((l) => l.code)).toContain("vi");
  });

  it("finds a language by its English name, for a name you only know that way", () => {
    expect(searchLanguages("khmer").map((l) => l.code)).toContain("km");
  });

  it("still accepts a code, for anyone who does know it", () => {
    expect(searchLanguages("ja").map((l) => l.code)).toContain("ja");
  });

  it("returns names, not codes, so the list can be read", () => {
    const [first] = searchLanguages("יפנ");
    expect(first.name).toBe("יפנית");
  });

  it("returns nothing for a language it does not carry", () => {
    expect(searchLanguages("קלינגונית")).toEqual([]);
  });

  it("ignores case and surrounding spaces", () => {
    expect(searchLanguages("  THAI ").map((l) => l.code)).toContain("th");
  });
});
