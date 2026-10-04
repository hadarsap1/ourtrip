// In-trip Today helpers (1.6): leave-by estimate, home (Israel) clock, and when
// to nudge for the evening journal. Pure, so they test without a clock.

export type LatLng = { lat: number; lng: number };

/** Great-circle distance in km. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// A rough city-travel model: road distance ~1.3x straight line, ~22 km/h door
// to door with two kids (taxi/Grab in traffic), plus a fixed 10-minute buffer
// for getting everyone out the door. Labelled as an estimate in the UI.
const ROAD_FACTOR = 1.3;
const KMH = 22;
const BUFFER_MIN = 10;

/** Estimated travel minutes between two points, rounded up to 5. */
export function travelMinutes(from: LatLng, to: LatLng): number {
  const raw = (haversineKm(from, to) * ROAD_FACTOR * 60) / KMH + BUFFER_MIN;
  return Math.max(BUFFER_MIN, Math.ceil(raw / 5) * 5);
}

/**
 * Minutes past midnight to leave by, or null when either end has no
 * coordinates or the trip is too long to be a "leave now" hop (> 3h - that is
 * a transfer with its own booking, not a walk to dinner).
 */
export function leaveByMinutes(startMinutes: number, from: LatLng | null, to: LatLng | null): number | null {
  if (!from || !to) return null;
  const t = travelMinutes(from, to);
  if (t > 180) return null;
  return Math.max(0, startMinutes - t);
}

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

/** The journal nudge shows from 18:00 until the day ends. */
export const EVENING_FROM = 18 * 60;
export function isEvening(nowMinutes: number): boolean {
  return nowMinutes >= EVENING_FROM;
}
