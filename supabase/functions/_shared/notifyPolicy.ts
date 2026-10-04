// 1.11 notification policy: WHEN each kind fires, in the family's local time.
// Pure and Deno/Node neutral so vitest covers it (notifyPolicy.test.ts).
//
// pg_cron runs in UTC; the family crosses seven zones. Every decision here is
// made in the zone of the country the itinerary puts them in today, so
// "evening journal at 20:00" means 20:00 in Hanoi and later 20:00 in Tbilisi.

/** IANA zone per country on this trip plus home. Unknown → home zone. */
export const ZONE_BY_COUNTRY: Record<string, string> = {
  IL: "Asia/Jerusalem",
  VN: "Asia/Ho_Chi_Minh",
  KH: "Asia/Phnom_Penh",
  LA: "Asia/Vientiane",
  TH: "Asia/Bangkok",
  PH: "Asia/Manila",
  JP: "Asia/Tokyo",
  GE: "Asia/Tbilisi",
  MY: "Asia/Kuala_Lumpur",
  SG: "Asia/Singapore",
  ID: "Asia/Jakarta",
  KR: "Asia/Seoul",
  TW: "Asia/Taipei",
  NP: "Asia/Kathmandu",
  IN: "Asia/Kolkata",
  LK: "Asia/Colombo",
  AE: "Asia/Dubai",
  TR: "Europe/Istanbul",
};

export function zoneFor(countryCode: string | null | undefined): string {
  return (countryCode && ZONE_BY_COUNTRY[countryCode.toUpperCase()]) || ZONE_BY_COUNTRY.IL;
}

export type LocalNow = { date: string; minutes: number };

/** Local calendar date (YYYY-MM-DD) and minutes past midnight in `zone`. */
export function localNow(now: Date, zone: string): LocalNow {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const t = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((t(toIso) - t(fromIso)) / 864e5);
}

// Quiet hours: nothing is pushed 22:00-07:00 local. Fixed for now - a
// per-member setting needs a column (proposed in docs/upgrade/PLAN.md).
export const QUIET_FROM = 22 * 60;
export const QUIET_TO = 7 * 60;
export function inQuietHours(minutes: number): boolean {
  return minutes >= QUIET_FROM || minutes < QUIET_TO;
}

// Fixed local slots. The hourly job fires at :00 UTC; every zone on this trip
// is a whole hour off UTC except Kathmandu/Kolkata/Colombo (:45/:30), so a slot
// matches on the local HOUR, never the exact minute.
export const SLOTS = {
  deadlines: 9,
  tomorrowDigest: 19,
  eveningJournal: 20,
} as const;
export type SlotKind = keyof typeof SLOTS;

export function slotsDue(minutes: number): SlotKind[] {
  if (inQuietHours(minutes)) return [];
  const hour = Math.floor(minutes / 60);
  return (Object.keys(SLOTS) as SlotKind[]).filter((k) => SLOTS[k] === hour);
}

/** Leave-now fires when leave-by falls in [now, now + window). Quiet hours win. */
export function leaveNowDue(leaveBy: number | null, minutes: number, windowMin = 15): boolean {
  if (leaveBy === null || inQuietHours(minutes)) return false;
  return leaveBy >= minutes && leaveBy < minutes + windowMin;
}

// ---- deadlines ----

/** Reminder offsets in days before a deadline. */
export const DEADLINE_OFFSETS = [7, 3, 1] as const;

export function isReminderDay(today: string, deadline: string | null | undefined): boolean {
  if (!deadline || !/^\d{4}-\d{2}-\d{2}/.test(deadline)) return false;
  return (DEADLINE_OFFSETS as readonly number[]).includes(daysBetween(today, deadline.slice(0, 10)));
}

/**
 * Free-cancellation deadline. There is no column for it; it lives in
 * bookings.details.free_cancel_until (YYYY-MM-DD) when the booking form or the
 * Gmail import sets it. Absent → no reminder.
 */
export function cancelDeadline(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const v = (details as Record<string, unknown>).free_cancel_until;
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export type VisaRow = { country_code: string; requirement_type: string; status: string; max_days: number | null; title_he: string };
export type DayRow = { date: string; country_code: string | null };

/** First and last itinerary date per country (one contiguous stretch assumed per visit). */
export function countryStretches(days: DayRow[]): Map<string, { first: string; last: string }> {
  const out = new Map<string, { first: string; last: string }>();
  for (const d of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!d.country_code) continue;
    const s = out.get(d.country_code);
    if (!s) out.set(d.country_code, { first: d.date, last: d.date });
    else s.last = d.date;
  }
  return out;
}

export type VisaReminder = { country: string; title: string; kind: "apply" | "stay"; date: string };

/**
 * Visa reminders due today:
 *  - apply: a visa/arrival card still "todo" whose country entry is 7/3/1 days away;
 *  - stay:  while in the country, the max-stay limit (entry + max_days - 1) is 7/3/1 days away.
 */
export function visaRemindersDue(today: string, rows: VisaRow[], days: DayRow[]): VisaReminder[] {
  const stretches = countryStretches(days);
  const out: VisaReminder[] = [];
  for (const r of rows) {
    const s = stretches.get(r.country_code);
    if (!s || r.status === "not_needed") continue;
    if (r.status === "todo" && (r.requirement_type === "visa" || r.requirement_type === "arrival_card") && isReminderDay(today, s.first)) {
      out.push({ country: r.country_code, title: r.title_he, kind: "apply", date: s.first });
    }
    if (r.max_days && today >= s.first && today <= s.last) {
      const limit = addDays(s.first, r.max_days - 1);
      // An exemption ("none") still has a stay limit; one reminder per country.
      const dup = out.some((o) => o.kind === "stay" && o.country === r.country_code);
      if (!dup && limit <= s.last && isReminderDay(today, limit)) out.push({ country: r.country_code, title: r.title_he, kind: "stay", date: limit });
    }
  }
  return out;
}
