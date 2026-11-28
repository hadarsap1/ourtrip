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

// ---- 19:00 tomorrow digest ----
//
// Sent only when there is something to say: an activity or booking tomorrow,
// or something ahead that still needs handling. An empty day with nothing
// pending sends nothing - "יום פנוי" alone is not worth a buzz.

/** How far ahead the digest looks for things that still need handling. */
export const DIGEST_CANCEL_WINDOW = 3; // free cancellation ends within N days
export const DIGEST_VISA_WINDOW = 7; // a visa/arrival card still "todo", entry within N days
export const DIGEST_STAY_WINDOW = 3; // max-stay limit within N days

export type DigestItem = { title: string; start_time: string | null };
export type DigestBooking = { title: string; type: string; start_date: string | null; end_date: string | null; details: unknown };
export type DigestInput = {
  today: string;
  locationName: string | null;
  items: DigestItem[];
  bookings: DigestBooking[]; // non-cancelled bookings of the trip
  visas: VisaRow[];
  days: DayRow[];
};

const within = (today: string, date: string, n: number) => {
  const d = daysBetween(today, date);
  return d >= 0 && d <= n;
};
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Things ahead that need a parent's hand, soonest first. */
export function digestActions(input: Omit<DigestInput, "items" | "locationName">): string[] {
  const { today, bookings, visas, days } = input;
  const out: { date: string; text: string }[] = [];
  for (const b of bookings) {
    const until = cancelDeadline(b.details);
    if (until && within(today, until, DIGEST_CANCEL_WINDOW)) out.push({ date: until, text: `ביטול חינם עד ${ddmm(until)}: ${b.title}` });
  }
  const stretches = countryStretches(days);
  for (const r of visas) {
    const s = stretches.get(r.country_code);
    if (!s || r.status === "not_needed") continue;
    if (r.status === "todo" && (r.requirement_type === "visa" || r.requirement_type === "arrival_card") && within(today, s.first, DIGEST_VISA_WINDOW)) {
      out.push({ date: s.first, text: `${r.title_he} - עדיין פתוח, נכנסים ב-${ddmm(s.first)}` });
    }
    if (r.max_days && today >= s.first && today <= s.last) {
      const limit = addDays(s.first, r.max_days - 1);
      const text = `${r.title_he} - היום האחרון המותר ${ddmm(limit)}`;
      if (limit <= s.last && within(today, limit, DIGEST_STAY_WINDOW) && !out.some((o) => o.text === text)) out.push({ date: limit, text });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date)).map((o) => o.text);
}

/** The digest push, or null when tomorrow is empty and nothing is pending. */
export function buildTomorrowDigest(input: DigestInput): { title: string; body: string } | null {
  const tomorrow = addDays(input.today, 1);
  const first = input.items.find((i) => i.start_time);
  const bookingLines = input.bookings.flatMap((b) => {
    const lines: string[] = [];
    if (b.start_date === tomorrow) lines.push(b.type === "flight" ? `טיסה: ${b.title}` : b.type === "hotel" ? `צ'ק-אין: ${b.title}` : b.title);
    if (b.type === "hotel" && b.end_date === tomorrow && b.start_date !== tomorrow) lines.push(`צ'ק-אאוט: ${b.title}`);
    return lines;
  });
  const actions = digestActions(input);
  if (input.items.length === 0 && bookingLines.length === 0 && actions.length === 0) return null;

  const parts = [
    input.items.length > 0 ? `${input.items.length} פעילויות` : null,
    first ? `הראשונה ב-${(first.start_time as string).slice(0, 5)} (${first.title})` : null,
    ...bookingLines,
    ...actions.map((a) => `⏳ ${a}`),
  ].filter(Boolean);
  const scheduled = input.items.length > 0 || bookingLines.length > 0;
  return {
    title: scheduled ? `🗓️ מחר${input.locationName ? ` ב${input.locationName}` : ""}` : "⏳ יש משהו לטפל בו",
    body: parts.join(" · "),
  };
}
