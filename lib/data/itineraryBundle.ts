import { listBookingFiles, listBookings } from "@/lib/data/bookings";
import { listDays, listItems } from "@/lib/data/itinerary";
import { listOptionAreas } from "@/lib/data/placeOptions";
import type { OptionForAreas } from "@/lib/data/segments";
import { queryKeys, writeQuery } from "@/lib/offline/queryCache";

/** Everything the itinerary screen draws, fetched together and cached (F9/F1). */
export async function fetchItineraryBundle(tripId: string) {
  const [days, bookings, files, areas] = await Promise.all([
    listDays(tripId),
    listBookings(tripId),
    listBookingFiles(tripId),
    // A failure here costs the idea counts and nothing else, so it must not
    // take the whole plan down with it.
    listOptionAreas(tripId).catch(() => [] as OptionForAreas[]),
  ]);
  const items = await listItems(days.map((d) => d.id));
  const bundle = { days, bookings, files, areas, items };
  void writeQuery(queryKeys.itinerary(tripId), bundle);
  return bundle;
}

export type ItineraryBundle = Awaited<ReturnType<typeof fetchItineraryBundle>>;
