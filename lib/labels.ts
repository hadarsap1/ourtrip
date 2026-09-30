// When two free-text labels are the same name.
//
// The options bank types areas and countries by hand, pastes them from
// Facebook, and gets them back from the extractor, so one town arrives in
// several byte-different spellings that read identically on screen:
//
//   מאי צ'או   (ASCII apostrophe, typed on a phone keyboard)
//   מאי צ׳או   (Hebrew geresh, what the extractor writes)
//   Kyushu / KYUSHU
//
// A plain Set keeps both, and every list built from the bank then offers the
// town twice. `labelKey` is the one comparison every such list uses. It only
// folds differences a reader cannot see - apostrophe and quote variants,
// spacing, letter case - and never spelling, which is canonicalLabel's job.

const APOSTROPHES = /['׳’‘`´]/g;
const QUOTES = /["״“”]/g;

export function labelKey(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(APOSTROPHES, "'")
    .replace(QUOTES, '"')
    .toLowerCase();
}

/** Each label once, first spelling seen wins, blanks dropped. */
export function distinctLabels(
  values: Iterable<string | null | undefined>
): string[] {
  const seen = new Map<string, string>();
  for (const raw of values) {
    const value = raw?.trim();
    if (!value) continue;
    const key = labelKey(value);
    if (!seen.has(key)) seen.set(key, value);
  }
  return [...seen.values()];
}
