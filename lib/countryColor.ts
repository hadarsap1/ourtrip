// A country's colour as theme-aware CSS variables (docs/design/tokens.css
// carries --country-xx, -soft and -on for the trip's countries, light and
// dark). A country the tokens do not know wears the brand colour, so nothing
// here assumes a destination (CLAUDE.md rule 9).

const TONED = new Set(["vn", "kh", "la", "th", "ph", "jp", "ge"]);

export type CountryTone = {
  /** the fill */
  bg: string;
  /** text on the fill */
  on: string;
  /** a pale wash of it, for a surface behind normal text */
  soft: string;
};

export function countryTone(code: string | null | undefined): CountryTone {
  const c = (code ?? "").trim().toLowerCase();
  if (!TONED.has(c)) return { bg: "var(--brand)", on: "var(--brand-contrast)", soft: "var(--brand-soft)" };
  return { bg: `var(--country-${c})`, on: `var(--country-${c}-on)`, soft: `var(--country-${c}-soft)` };
}
