// Photos by place (Hadar 01/11/2026): the photos screen reads like the trip,
// one section per stretch in a place, newest stretch first. A photo's place
// is the itinerary day it was taken on; a day with no place (or a photo whose
// place the reader may not know) gets a section of its own by date.

export type PhotoPlaceInfo = {
  place: string | null;
  country_code: string | null;
  lat: number | null;
  lng: number | null;
};

export type PlaceGroup<P> = {
  /** Stable key for the section (scroll target, React key). */
  key: string;
  place: string | null;
  country_code: string | null;
  lat: number | null;
  lng: number | null;
  /** First and last day of the stretch (YYYY-MM-DD). */
  from: string;
  to: string;
  /** In the order they were taken. */
  photos: P[];
};

/**
 * Group photos into stretches: consecutive days in the same place are one
 * section; coming back to a place later is a new one, so the screen stays in
 * trip order. `photos` may come in any order; ties on a day keep their order.
 */
export function groupByPlace<P extends { taken_on: string }>(
  photos: P[],
  placeOf: (photo: P) => PhotoPlaceInfo | null | undefined
): PlaceGroup<P>[] {
  const sorted = photos
    .map((photo, i) => ({ photo, i }))
    .sort((a, b) => a.photo.taken_on.localeCompare(b.photo.taken_on) || a.i - b.i);

  const groups: PlaceGroup<P>[] = [];
  let current: PlaceGroup<P> | null = null;
  for (const { photo } of sorted) {
    const info = placeOf(photo);
    const place = info?.place?.trim() || null;
    const same =
      current !== null &&
      (place !== null
        ? current.place === place
        : current.place === null && current.to === photo.taken_on);
    if (current && same) {
      current.photos.push(photo);
      current.to = photo.taken_on;
      current.lat ??= info?.lat ?? null;
      current.lng ??= info?.lng ?? null;
      current.country_code ??= info?.country_code ?? null;
      continue;
    }
    current = {
      key: `${place ?? "day"}|${photo.taken_on}`,
      place,
      country_code: info?.country_code ?? null,
      lat: info?.lat ?? null,
      lng: info?.lng ?? null,
      from: photo.taken_on,
      to: photo.taken_on,
      photos: [photo],
    };
    groups.push(current);
  }
  // newest stretch first, like the updates
  return groups.reverse();
}

/** Look up a photo's place by the day it was taken on. */
export function placeByDate(
  days: { date: string; location_name: string | null; country_code: string | null; lat: number | null; lng: number | null }[]
): (photo: { taken_on: string }) => PhotoPlaceInfo | undefined {
  const map = new Map(
    days.map((d) => [d.date, { place: d.location_name, country_code: d.country_code, lat: d.lat, lng: d.lng }])
  );
  return (photo) => map.get(photo.taken_on);
}
