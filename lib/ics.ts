// ICS export (Phase 2.7): the trip's country stays and bookings as one .ics
// file the phone's calendar can import. Pure, so tested. RFC 5545 basics:
// CRLF line ends, 75-octet folding, escaped text, all-day DTEND exclusive.
// Times are "floating" (no zone): a booking's times are local to where it
// happens, which is exactly what a floating time means.

import type { Booking } from "@/lib/types";
import type { Stretch } from "@/lib/data/segments";

const CRLF = "\r\n";

export function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds a content line to 75 octets (UTF-8 safe: never splits a character). */
export function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  let curBytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (curBytes + b > limit) {
      out.push(cur);
      cur = ch;
      curBytes = b;
    } else {
      cur += ch;
      curBytes += b;
    }
  }
  out.push(cur);
  return out.join(`${CRLF} `);
}

const ymd = (iso: string) => iso.replace(/-/g, "");
function nextDay(iso: string): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}
function detail(b: Pick<Booking, "details">, key: string): string | null {
  const d = b.details;
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  const v = (d as Record<string, unknown>)[key];
  return typeof v === "string" && /^\d{2}:\d{2}$/.test(v.trim()) ? v.trim().replace(":", "") + "00" : null;
}

export type IcsInput = {
  tripName: string;
  stretches: Pick<Stretch, "from" | "to" | "locationName" | "countryCode">[];
  bookings: Booking[];
  countryName: (code: string) => string;
  typeLabel: (type: Booking["type"]) => string;
  now?: Date;
};

export function buildIcs({ tripName, stretches, bookings, countryName, typeLabel, now = new Date() }: IcsInput): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OurTrip//HE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(tripName)}`,
  ];
  const event = (uid: string, props: string[]) => lines.push("BEGIN:VEVENT", `UID:${uid}@ourtrip`, `DTSTAMP:${stamp}`, ...props, "END:VEVENT");

  for (const s of stretches) {
    const place = s.locationName ?? (s.countryCode ? countryName(s.countryCode) : "");
    if (!place) continue;
    event(`stay-${s.from}-${s.countryCode ?? "x"}`, [
      `DTSTART;VALUE=DATE:${ymd(s.from)}`,
      `DTEND;VALUE=DATE:${ymd(nextDay(s.to))}`,
      `SUMMARY:${escapeText(place)}`,
      "TRANSP:TRANSPARENT",
    ]);
  }

  for (const b of bookings) {
    if (b.status === "cancelled" || !b.start_date) continue;
    const stay = b.type === "hotel" || b.type === "car_rental";
    const t1 = stay ? detail(b, "check_in") : detail(b, "departure_time");
    const t2 = stay ? detail(b, "check_out") : detail(b, "arrival_time");
    const end = b.end_date && b.end_date >= b.start_date ? b.end_date : b.start_date;
    const desc = [b.confirmation_code ? `#${b.confirmation_code}` : null, b.notes].filter(Boolean).join("\n");
    // A same-day booking whose end time is earlier than its start (an
    // overnight flight, 23:40 → 17:05) ends the next day.
    const endDay = end === b.start_date && t1 && t2 && t2 <= t1 ? nextDay(end) : end;
    const props = t1
      ? [`DTSTART:${ymd(b.start_date)}T${t1}`, `DTEND:${ymd(endDay)}T${t2 ?? t1}`]
      : [`DTSTART;VALUE=DATE:${ymd(b.start_date)}`, `DTEND;VALUE=DATE:${ymd(nextDay(end))}`];
    event(`booking-${b.id}`, [
      ...props,
      `SUMMARY:${escapeText(`${typeLabel(b.type)}: ${b.title}`)}`,
      ...(desc ? [`DESCRIPTION:${escapeText(desc)}`] : []),
    ]);
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join(CRLF) + CRLF;
}
