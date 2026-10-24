import { splitIntoStretches } from "@/lib/data/segments";
import type { ItineraryDay, ItineraryItem } from "@/lib/types";

/** One place on the way, as the kids' route shows it (read-only). */
export type KidStop = {
  key: string;
  countryCode: string | null;
  place: string | null;
  from: string;
  to: string;
  dayCount: number;
  /** Today falls inside this stop. */
  isNow: boolean;
  /** Only the days that have something planned, each with its plans. */
  plannedDays: { date: string; items: { id: string; title: string; time: string | null }[] }[];
};

/**
 * The trip from today on, grouped into stops (consecutive days at the same
 * place - the same rule the parents' itinerary uses). Past days drop out;
 * cancelled plans are not shown. Bookings are not here at all: kids have no
 * policy on them.
 */
export function buildKidRoute(days: ItineraryDay[], items: ItineraryItem[], today: string): KidStop[] {
  const ahead = days.filter((d) => d.date >= today);
  const byDay = new Map<string, ItineraryItem[]>();
  for (const item of items) {
    if (item.status === "cancelled") continue;
    const list = byDay.get(item.day_id) ?? [];
    list.push(item);
    byDay.set(item.day_id, list);
  }
  return splitIntoStretches(ahead).map((s) => ({
    key: `${s.from}-${s.countryCode ?? ""}-${s.locationName ?? ""}`,
    countryCode: s.countryCode,
    place: s.locationName,
    from: s.from,
    to: s.to,
    dayCount: s.days.length,
    isNow: s.from <= today && today <= s.to,
    plannedDays: s.days
      .map((d) => ({
        date: d.date,
        items: (byDay.get(d.id) ?? []).map((i) => ({ id: i.id, title: i.title, time: i.start_time })),
      }))
      .filter((d) => d.items.length > 0),
  }));
}
