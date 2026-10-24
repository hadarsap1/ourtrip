// Map v2 (Phase 2.9): the trip line and country colours. Pure, so tested.

import type { Booking, ItineraryDay, ItineraryItem } from "@/lib/types";

/** Light-theme country colours from docs/design/tokens.json (Google Maps needs hex, not CSS vars). */
export const COUNTRY_HEX: Record<string, string> = {
  VN: "#C42B3A",
  KH: "#A35A00",
  LA: "#2F7A4A",
  TH: "#3348A8",
  PH: "#0A72A8",
  JP: "#B0306E",
  GE: "#4A5361",
};
export const NEUTRAL_HEX = "#66717B";

export function countryHex(code: string | null | undefined): string {
  return (code && COUNTRY_HEX[code.toUpperCase()]) || NEUTRAL_HEX;
}

export type DayPoint = { dayId: string; date: string; country: string | null; lat: number; lng: number };

/** One point per day that has located items: their centroid, in date order. */
export function dayCentroids(
  days: Pick<ItineraryDay, "id" | "date" | "country_code">[],
  items: Pick<ItineraryItem, "day_id" | "lat" | "lng" | "status">[]
): DayPoint[] {
  const acc = new Map<string, { lat: number; lng: number; n: number }>();
  for (const i of items) {
    if (i.lat == null || i.lng == null || i.status === "cancelled") continue;
    const a = acc.get(i.day_id) ?? { lat: 0, lng: 0, n: 0 };
    a.lat += i.lat;
    a.lng += i.lng;
    a.n += 1;
    acc.set(i.day_id, a);
  }
  return [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((d) => acc.has(d.id))
    .map((d) => {
      const a = acc.get(d.id)!;
      return { dayId: d.id, date: d.date, country: d.country_code, lat: a.lat / a.n, lng: a.lng / a.n };
    });
}

export type RouteSegment = { from: DayPoint; to: DayPoint; color: string };

/** Consecutive day points joined, each segment in the colour of the country it arrives in. Same-place hops are skipped. */
export function tripSegments(points: DayPoint[]): RouteSegment[] {
  const out: RouteSegment[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (Math.abs(a.lat - b.lat) < 1e-4 && Math.abs(a.lng - b.lng) < 1e-4) continue;
    out.push({ from: a, to: b, color: countryHex(b.country) });
  }
  return out;
}

const TYPE_GLYPH: Record<string, string> = { flight: "✈️", hotel: "🏨", train: "🚆", car_rental: "🚗", attraction: "🎟️", other: "📌" };

/** Category glyph for an item: its booking's type when it came from one, else none. */
export function itemGlyph(item: Pick<ItineraryItem, "booking_id">, bookingsById: Map<string, Pick<Booking, "type">>): string | null {
  const b = item.booking_id ? bookingsById.get(item.booking_id) : undefined;
  return b ? TYPE_GLYPH[b.type] ?? null : null;
}
