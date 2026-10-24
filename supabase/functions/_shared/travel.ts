// Travel-time estimate shared by the app (Today's leave-by line, lib/inTrip.ts)
// and push-send (the leave-now notification), so both say the same time.
// No imports on purpose: Deno and Next both compile this file as is.

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
 * coordinates or the hop is over 3h (that is a transfer with its own booking,
 * not a walk to dinner).
 */
export function leaveByMinutes(startMinutes: number, from: LatLng | null, to: LatLng | null): number | null {
  if (!from || !to) return null;
  const t = travelMinutes(from, to);
  if (t > 180) return null;
  return Math.max(0, startMinutes - t);
}

/** "14:30:00" → minutes past midnight, or null. */
export function minutesOfTime(time: string | null | undefined): number | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  return Number.isNaN(h) || Number.isNaN(m) ? null : h * 60 + m;
}

type Placed = { start_time: string | null; lat: number | null; lng: number | null; status?: string };

const at = (o: { lat: number | null; lng: number | null } | null | undefined): LatLng | null =>
  o && o.lat != null && o.lng != null ? { lat: o.lat, lng: o.lng } : null;

/** Where we set out from for `target`: the latest earlier item with a place, else the day's base. */
export function originFor<T extends Placed>(items: T[], target: T, base: LatLng | null): LatLng | null {
  const start = minutesOfTime(target.start_time) ?? Infinity;
  const before = items
    .filter((i) => i !== target && i.status !== "cancelled" && at(i) && (minutesOfTime(i.start_time) ?? Infinity) < start)
    .sort((a, b) => (minutesOfTime(b.start_time) ?? 0) - (minutesOfTime(a.start_time) ?? 0));
  return at(before[0]) ?? base;
}

export { at as placeOf };
