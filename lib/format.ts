import { getSimDate } from "./simDate";
// Date and money formatting (CLAUDE.md hard rule #4: DD/MM/YYYY, ₪ for ILS).

/** "2026-10-24" → "24/10/2026" */
export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

/** "2026-10-24" → "24/10" */
export function formatShortDate(isoDate: string): string {
  const [, m, d] = isoDate.split("-");
  return `${d}/${m}`;
}

/** Hebrew weekday name for an ISO date ("יום שבת"). */
export function formatWeekday(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("he-IL", {
    weekday: "long",
  });
}

/** Single-letter Hebrew weekday ("ו׳", "ש׳") for dense day rows, where the
 *  long form would be wider than everything else on the line. */
export function formatWeekdayNarrow(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("he-IL", {
    weekday: "narrow",
  });
}

/** "14:30:00" or "14:30" → "14:30" */
export function formatTime(time: string): string {
  return time.slice(0, 5);
}

export function formatMoney(amount: number, currency: string): string {
  // Whole amounts stay whole (₪14,200); otherwise always two decimals - never
  // "₪179,815.5" (found in QA).
  const whole = Math.abs(amount - Math.round(amount)) < 0.005;
  const n = amount.toLocaleString("he-IL", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
  return currency === "ILS" ? `₪${n}` : `${n} ${currency}`;
}

/** Today as an ISO date in local time (or the dev simulated date, 1.10). */
export function todayISO(): string {
  const sim = getSimDate();
  if (sim) return sim;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
