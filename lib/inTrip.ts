// In-trip Today helpers (1.6): leave-by estimate, home (Israel) clock, and when
// to nudge for the evening journal. Pure, so they test without a clock.

export { haversineKm, leaveByMinutes, travelMinutes, type LatLng } from "@/supabase/functions/_shared/travel";
import { ZONE_BY_COUNTRY } from "@/supabase/functions/_shared/notifyPolicy";

/** "HH:MM" for minutes past midnight. */
export function hhmm(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Wall-clock minutes past midnight in a time zone. */
export function zoneMinutes(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/**
 * Israel time when it differs from the device clock (the phone follows the
 * local zone abroad), else null - no point showing two identical clocks.
 */
export function homeClock(now: Date, deviceMinutes: number, homeZone = "Asia/Jerusalem"): string | null {
  const home = zoneMinutes(now, homeZone);
  return home === deviceMinutes ? null : hhmm(home);
}

/**
 * The family's clock for a guest in Israel (00069): "HH:MM" in the zone of the
 * country they are in today. Null when it would say nothing new (in Israel,
 * no day today) or when the country's zone is not known - a wrong time is
 * worse than none.
 */
export function familyClock(now: Date, countryCode: string | null | undefined): string | null {
  const code = countryCode?.toUpperCase();
  if (!code || code === "IL") return null;
  const zone = ZONE_BY_COUNTRY[code];
  return zone ? hhmm(zoneMinutes(now, zone)) : null;
}

/** Israel's clock, always (the kids' home): "HH:MM". */
export function israelClock(now: Date): string {
  return hhmm(zoneMinutes(now, "Asia/Jerusalem"));
}

/** The journal nudge shows from 18:00 until the day ends. */
export const EVENING_FROM = 18 * 60;
export function isEvening(nowMinutes: number): boolean {
  return nowMinutes >= EVENING_FROM;
}
