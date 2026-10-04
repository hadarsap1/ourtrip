// Bookings v2 (Phase 2.1) - pure helpers for the tile grid and the rich card.

import type { Booking, BookingType } from "@/lib/types";

export const TYPE_ORDER: BookingType[] = ["flight", "hotel", "train", "car_rental", "attraction", "other"];

/** Live (not cancelled) bookings per type, in display order, zero counts dropped. */
export function countByType(bookings: Pick<Booking, "type" | "status">[]): { type: BookingType; count: number }[] {
  const counts = new Map<BookingType, number>();
  for (const b of bookings) if (b.status !== "cancelled") counts.set(b.type, (counts.get(b.type) ?? 0) + 1);
  return TYPE_ORDER.filter((t) => counts.get(t)).map((type) => ({ type, count: counts.get(type)! }));
}

function detail(b: Pick<Booking, "details">, key: string): string | null {
  const d = b.details;
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  const v = (d as Record<string, unknown>)[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export type BookingFacts = {
  /** Big times: departure/arrival or check-in/check-out. */
  from: string | null;
  to: string | null;
  timesKind: "travel" | "stay" | null;
  flightNumber: string | null;
  terminal: string | null;
  gate: string | null;
  provider: string | null;
};

export function bookingFacts(b: Pick<Booking, "type" | "details">): BookingFacts {
  const stay = b.type === "hotel" || b.type === "car_rental";
  const from = stay ? detail(b, "check_in") : detail(b, "departure_time");
  const to = stay ? detail(b, "check_out") : detail(b, "arrival_time");
  return {
    from,
    to,
    timesKind: from || to ? (stay ? "stay" : "travel") : null,
    flightNumber: detail(b, "flight_number"),
    terminal: detail(b, "terminal"),
    gate: detail(b, "gate"),
    provider: detail(b, "provider"),
  };
}
