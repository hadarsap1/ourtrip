import { describe, expect, it } from "vitest";
import {
  cleanPhonetic,
  isEchoOfHebrew,
  isHebrewTransliteration,
  isUsableHebrew,
} from "./phonetic";

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

// The second thing the model did wrong, and it was caused by the fix for the
// first: told the transliteration may never contain the source script, it
// echoed the Hebrew phrase instead. These are real rows from the live Thai and
// Filipino books.
describe("isEchoOfHebrew", () => {
  it("catches the Hebrew phrase copied into the transliteration", () => {
    expect(isEchoOfHebrew("בטן כואבת", "בטן כואבת")).toBe(true);
    expect(isEchoOfHebrew("קראו לרופא", "קראו לרופא")).toBe(true);
  });

  it("catches an echo that dropped the punctuation", () => {
    expect(isEchoOfHebrew("איפה בית מרקחת", "איפה בית מרקחת?")).toBe(true);
    expect(isEchoOfHebrew("זה בטוח לילדים", "זה בטוח לילדים?")).toBe(true);
  });

  it("leaves a real transliteration alone", () => {
    expect(isEchoOfHebrew("פואד תונג", "בטן כואבת")).toBe(false);
    expect(isEchoOfHebrew("סומימאסן", "סליחה")).toBe(false);
  });

  it("is not fooled by an empty transliteration", () => {
    expect(isEchoOfHebrew("", "")).toBe(false);
    expect(isEchoOfHebrew("   ", "בטן כואבת")).toBe(false);
  });
});

describe("cleanPhonetic with the Hebrew phrase", () => {
  it("drops an echo", () => {
    expect(cleanPhonetic("בטן כואבת", "בטן כואבת")).toBeNull();
  });

  it("keeps a genuine transliteration", () => {
    expect(cleanPhonetic("פואד תונג", "בטן כואבת")).toBe("פואד תונג");
  });

  it("still drops a contaminated one", () => {
    expect(cleanPhonetic("ח๊ัน แพ๎", "אני אלרגי")).toBeNull();
  });
});
