// Country list for the searchable picker (F8). No data dependency: names come
// from Intl.DisplayNames in Hebrew and English, flags from regional-indicator
// characters. Nothing here assumes a destination (CLAUDE.md #9).

// ISO 3166-1 alpha-2, assigned codes.
const ISO = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT " +
  "MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG " +
  "UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ");

export type Country = { code: string; he: string; en: string; flag: string };

/** Flag from regional-indicator symbols; renders as the flag on iOS/Android. */
export function flagEmoji(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

let cache: Country[] | null = null;

export function allCountries(): Country[] {
  if (cache) return cache;
  let he: Intl.DisplayNames | null = null;
  let en: Intl.DisplayNames | null = null;
  try {
    he = new Intl.DisplayNames(["he"], { type: "region" });
    en = new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    // very old engine: codes only
  }
  cache = ISO.map((code) => ({
    code,
    he: he?.of(code) ?? code,
    en: en?.of(code) ?? code,
    flag: flagEmoji(code),
  })).sort((a, b) => a.he.localeCompare(b.he, "he"));
  return cache;
}

export function findCountry(code: string | null | undefined): Country | null {
  if (!code) return null;
  const up = code.toUpperCase();
  return allCountries().find((c) => c.code === up) ?? null;
}

// Hebrew spelling variants the family actually types (DECISIONS #23): a
// leading ה and doubled yod/vav should not hide a country.
function normHe(s: string): string {
  return s.replace(/^ה/, "").replace(/יי/g, "י").replace(/וו/g, "ו").replace(/[\s'"׳״-]/g, "");
}

/**
 * Search by Hebrew name, English name or code. `priority` codes (the trip's
 * own countries) come first, in the given order, when the query is empty or
 * they match.
 */
export function searchCountries(query: string, priority: string[] = [], limit = 50): Country[] {
  const q = query.trim().toLowerCase();
  const list = allCountries();
  const matches = q
    ? list.filter((c) => {
        if (c.code.toLowerCase() === q) return true;
        if (c.en.toLowerCase().includes(q)) return true;
        return normHe(c.he).includes(normHe(q));
      })
    : list;
  const pri = priority.map((p) => p.toUpperCase());
  const rank = (c: Country) => {
    const i = pri.indexOf(c.code);
    if (i >= 0) return i;
    if (q && c.code.toLowerCase() === q) return pri.length;
    return pri.length + 1;
  };
  return [...matches].sort((a, b) => rank(a) - rank(b)).slice(0, limit);
}
