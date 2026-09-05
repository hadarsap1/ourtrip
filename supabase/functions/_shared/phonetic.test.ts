import { describe, expect, it } from "vitest";
import { cleanPhonetic, isHebrewTransliteration, isUsableHebrew } from "./phonetic";

// These are real values the Thai phrasebook produced. The transliteration is
// there so someone who cannot read Thai can say the phrase out loud, so a Thai
// glyph inside it defeats the whole field.

describe("isHebrewTransliteration", () => {
  it("accepts a clean Hebrew transliteration", () => {
    expect(isHebrewTransliteration("קונ'ניצ'יווה")).toBe(true);
    expect(isHebrewTransliteration("טוי מוותן מואה קאי נאי")).toBe(true);
  });

  it("accepts niqqud, which a transliteration legitimately uses", () => {
    expect(isHebrewTransliteration("מַי פֶּט דַי פרוד")).toBe(true);
  });

  it("accepts Latin letters, for a language transliterated that way", () => {
    expect(isHebrewTransliteration("Konnichiwa")).toBe(true);
  });

  it("rejects Thai glyphs leaking in - the actual defect", () => {
    expect(isHebrewTransliteration("ח๊ัน แพ๎")).toBe(false);
    expect(isHebrewTransliteration("מี๊ קי")).toBe(false);
    expect(isHebrewTransliteration("צ׳ק ביל ดี פרוד")).toBe(false);
  });

  it("rejects Japanese and Vietnamese glyphs too", () => {
    expect(isHebrewTransliteration("קונ こんにちは")).toBe(false);
    expect(isHebrewTransliteration("טוי dị ứng")).toBe(false);
  });
});

describe("cleanPhonetic", () => {
  it("keeps a usable transliteration", () => {
    expect(cleanPhonetic(" סומימאסן ")).toBe("סומימאסן");
  });

  it("drops a contaminated one rather than scrubbing it", () => {
    // Stripping would leave "חן", which is not how the phrase sounds and
    // reads as though somebody had checked it.
    expect(cleanPhonetic("ח๊ัน แพ๎")).toBeNull();
  });

  it("treats empty and missing as no transliteration", () => {
    expect(cleanPhonetic("")).toBeNull();
    expect(cleanPhonetic("   ")).toBeNull();
    expect(cleanPhonetic(null)).toBeNull();
    expect(cleanPhonetic(undefined)).toBeNull();
  });
});

describe("isUsableHebrew", () => {
  it("accepts real Hebrew", () => {
    expect(isUsableHebrew("איפה השירותים?")).toBe(true);
  });

  it("rejects a phrase that lost its Hebrew", () => {
    expect(isUsableHebrew("Tôi muốn mua")).toBe(false);
    expect(isUsableHebrew("   ")).toBe(false);
    expect(isUsableHebrew(null)).toBe(false);
  });
});
