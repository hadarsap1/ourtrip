// Parses free-text expense lines typed/pasted into the quick-add sheet, e.g.
//   חיסונים 1200
//   ביטוח נסיעות 3400 USD
//   דרכונים ₪600
//   $250 תיק גב
// Each line becomes one expense. Anything without a number is reported back as
// unparsed rather than silently dropped, so nothing is ever lost quietly.

import { CURRENCIES } from "./currencies";

export type ParsedLine = {
  raw: string;
  description: string;
  amount: number;
  currency: string;
};

export type ParsedLines = { lines: ParsedLine[]; unparsed: string[] };

const SYMBOL_CURRENCY: [string, string][] = [
  ["₪", "ILS"],
  ["$", "USD"],
  ["€", "EUR"],
  ["£", "GBP"],
  ["¥", "JPY"],
  ["฿", "THB"],
  ["₫", "VND"],
];

// Currency codes we accept as a bare word (the picker's shortlist plus a few
// common ones the family will actually meet on this route).
const EXTRA_CODES = ["LAK", "KHR", "PHP", "MYR", "IDR", "CHF", "CAD", "AED"];
const CODES = new Set<string>([...CURRENCIES, ...EXTRA_CODES]);

/** "12,500" → 12500 · "1200" → 1200 · "3.5" → 3.5 */
function toAmount(token: string): number | null {
  const cleaned = token.replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Parses one line into {description, amount, currency}, or null if there is
 *  no usable number in it. `fallbackCurrency` applies when none is written. */
export function parseExpenseLine(
  raw: string,
  fallbackCurrency = "ILS"
): ParsedLine | null {
  const text = raw.trim();
  if (!text) return null;

  let currency: string | null = null;
  let rest = text;

  // 1) currency symbol anywhere (₪600 / 600₪ / $ 250)
  for (const [symbol, code] of SYMBOL_CURRENCY) {
    if (rest.includes(symbol)) {
      currency = code;
      rest = rest.split(symbol).join(" ");
      break;
    }
  }

  // 2) a standalone 3-letter currency code (USD, THB…)
  if (!currency) {
    const words = rest.split(/\s+/);
    const idx = words.findIndex((w) => CODES.has(w.toUpperCase().replace(/[^A-Z]/gi, "")));
    if (idx !== -1) {
      currency = words[idx].toUpperCase().replace(/[^A-Z]/gi, "");
      words.splice(idx, 1);
      rest = words.join(" ");
    }
  }

  // 3) the amount: last number on the line (descriptions rarely end in one,
  //    and "טיסה 2 מבוגרים 1200" should take 1200, not 2)
  const numbers = rest.match(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g);
  if (!numbers || numbers.length === 0) return null;
  const token = numbers[numbers.length - 1];
  const amount = toAmount(token);
  if (amount === null) return null;

  // description = everything except that number token
  const cut = rest.lastIndexOf(token);
  const description = (rest.slice(0, cut) + " " + rest.slice(cut + token.length))
    .replace(/\s+/g, " ")
    .trim();

  return {
    raw: text,
    description,
    amount,
    currency: currency ?? fallbackCurrency,
  };
}

/** Parses a whole textarea. Blank lines are ignored; lines with no number are
 *  returned in `unparsed` so the UI can show what it could not read. */
export function parseExpenseLines(
  text: string,
  fallbackCurrency = "ILS"
): ParsedLines {
  const lines: ParsedLine[] = [];
  const unparsed: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const parsed = parseExpenseLine(raw, fallbackCurrency);
    if (parsed) lines.push(parsed);
    else unparsed.push(raw.trim());
  }
  return { lines, unparsed };
}
