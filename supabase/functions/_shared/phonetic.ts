// Guards the transliteration field.
//
// WHY. The Thai phrasebook came back with entries like "ח๊ัน แพ๎" and
// "מี๊ קי" - Thai glyphs sitting inside the field that is supposed to be
// readable by someone who cannot read Thai. That is the entire point of the
// field, so a leak makes it worse than empty: it looks like guidance and
// cannot be sounded out.
//
// The rule is deliberately about SCRIPT, not about spelling. Anything outside
// Hebrew letters, plain ASCII and ordinary punctuation means the model reached
// for the source alphabet, and the value cannot be trusted as a whole.
//
// DEPLOYMENT. This is the single tested source, imported by the functions as
// "../_shared/phonetic.ts" - the layout the Supabase CLI expects. The MCP
// deploy tool uploads a flat bundle, so when deploying that way send this file
// alongside index.ts as "phonetic.ts" and change the import to "./phonetic.ts".
// The content is identical either way; only the path differs.

/** Hebrew letters, niqqud, ASCII letters/digits, spaces and light punctuation. */
const ALLOWED = /^[֐-׿ -~’'\-.,!?()…]*$/;

export function isHebrewTransliteration(value: string): boolean {
  return ALLOWED.test(value);
}

/**
 * The transliteration to store: the value when it is usable, otherwise null.
 *
 * Null rather than a scrubbed string on purpose. Stripping the foreign glyphs
 * out of "ח๊ัน แพ๎" leaves "חן", which is not how the phrase sounds and reads
 * as though someone checked it. An entry with no transliteration still shows
 * its Hebrew and its native script, and honestly says nothing about the sound.
 */
export function cleanPhonetic(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") return null;
  return isHebrewTransliteration(trimmed) ? trimmed : null;
}

/** Must contain at least one Hebrew letter to be Hebrew at all. */
const HAS_HEBREW = /[א-ת]/;

/** A phrase we are willing to store: present, and actually in Hebrew. */
export function isUsableHebrew(value: string | null | undefined): boolean {
  const trimmed = (value ?? "").trim();
  return trimmed !== "" && HAS_HEBREW.test(trimmed);
}
