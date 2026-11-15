// What was booked for today, for the parents' home. The home carries no plan
// by the hour (Hadar 15/11/2026); the full plan is on the itinerary screen.

import type { Booking, ItineraryItem } from "@/lib/types";

export type BookedRow = {
  key: string;
  title: string;
  time: string | null;
  place: string | null;
  code: string | null;
  lat: number | null;
  lng: number | null;
};

/** Today's booked things, the bed excluded (it has its own tile): each of
 *  today's bookings, with its item on the plan when there is one, then items
 *  tied to a booking that is not among today's. Finished items drop out. */
export function bookedToday(items: ItineraryItem[], bookings: Booking[], lodging: Booking | null): BookedRow[] {
  const rows: BookedRow[] = [];
  const used = new Set<string>();
  for (const b of bookings) {
    if (b === lodging || b.id === lodging?.id) continue;
    const item = items.find((i) => i.booking_id === b.id) ?? null;
    if (item) used.add(item.id);
    if (item?.status === "done") continue;
    rows.push({
      key: `b-${b.id}`,
      title: item?.title ?? b.title,
      time: item?.start_time ?? null,
      place: item?.location_name ?? null,
      code: b.confirmation_code,
      lat: item?.lat ?? null,
      lng: item?.lng ?? null,
    });
  }
  for (const i of items) {
    if (!i.booking_id || used.has(i.id) || i.status === "done" || i.booking_id === lodging?.id) continue;
    rows.push({ key: `i-${i.id}`, title: i.title, time: i.start_time, place: i.location_name, code: null, lat: i.lat, lng: i.lng });
  }
  return rows.sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99"));
}
