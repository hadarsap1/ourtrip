// Airport typeahead over the full OurAirports dataset (lazy-loaded) blended with
// the curated Hebrew shortlist so Hebrew searches still find major cities and
// show Hebrew labels. Pure functions — the component owns the loaded data.
import { AIRPORTS } from "./airports";
import type { FullAirport } from "./airportsData";

export type Suggestion = { code: string; label: string };
type Indexed = { code: string; label: string; hay: string; words: string[] };

/** Builds a searchable index. Curated (Hebrew) entries win over the full list
 *  for the same code, so majors keep their Hebrew label and sort first. */
export function buildAirportIndex(full: FullAirport[] | null): Indexed[] {
  const byCode = new Map<string, Indexed>();
  for (const a of AIRPORTS) {
    const hay = `${a.code} ${a.he} ${a.en}`.toLowerCase();
    byCode.set(a.code, { code: a.code, label: `${a.code} · ${a.he} · ${a.en}`, hay, words: hay.split(" ") });
  }
  if (full) {
    for (const [code, city, cc] of full) {
      if (byCode.has(code)) continue;
      const hay = `${code} ${city} ${cc}`.toLowerCase();
      byCode.set(code, { code, label: `${code} · ${city} · ${cc}`, hay, words: hay.split(" ") });
    }
  }
  return [...byCode.values()];
}

/** Top matches for the datalist: exact code, then word-prefix, then substring. */
export function searchAirports(index: Indexed[], query: string, limit = 25): Suggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return index.slice(0, limit).map(({ code, label }) => ({ code, label }));

  const exact: Suggestion[] = [];
  const starts: Suggestion[] = [];
  const incl: Suggestion[] = [];
  for (const it of index) {
    if (it.code.toLowerCase() === q) exact.push({ code: it.code, label: it.label });
    else if (it.words.some((w) => w.startsWith(q))) starts.push({ code: it.code, label: it.label });
    else if (it.hay.includes(q)) incl.push({ code: it.code, label: it.label });
    if (starts.length + incl.length > limit * 4) break;
  }
  return [...exact, ...starts, ...incl].slice(0, limit);
}

/** Resolves free text to an IATA code: a raw 3-letter code passes through;
 *  otherwise the best matching airport's code; else the uppercased input. */
export function resolveAirportCode(index: Indexed[], text: string): string {
  const t = text.trim();
  if (/^[A-Za-z]{3}$/.test(t)) return t.toUpperCase();
  const q = t.toLowerCase();
  if (!q) return "";
  const best =
    index.find((it) => it.code.toLowerCase() === q) ??
    index.find((it) => it.words.some((w) => w.startsWith(q))) ??
    index.find((it) => it.hay.includes(q));
  return best ? best.code : t.toUpperCase();
}
