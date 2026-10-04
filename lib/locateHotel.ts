// Turning a hotel booking into a place on the map, for hotelItinerarySync.
//
// A booking stores its address as free text (and some have none, only the
// hotel's name), so it goes through Google's geocoder - the same Maps script
// PlaceAutocomplete already loads, so nothing new is added. Without the key,
// or offline, this returns null and the caller says it cannot look hotels up.

import { loadGoogleMaps } from "@/lib/places";
import type { HotelPlace } from "@/lib/hotelItinerarySync";
import type { Booking } from "@/lib/types";

/** Repeated syncs in one session ask about the same handful of hotels. */
const cache = new Map<string, HotelPlace | null>();

function addressOf(booking: Booking): string | null {
  const details = booking.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const address = (details as Record<string, unknown>).address;
  return typeof address === "string" && address.trim() ? address.trim() : null;
}

/** The town a result is in. Locality first; the fallbacks cover places Google
 *  files without one (much of Vietnam, the UK's postal towns). */
function townOf(components: google.maps.GeocoderAddressComponent[]): string | null {
  for (const type of [
    "locality",
    "postal_town",
    "administrative_area_level_2",
    "administrative_area_level_1",
  ]) {
    const hit = components.find((c) => c.types.includes(type));
    if (hit) return hit.long_name;
  }
  return null;
}

function toPlace(result: google.maps.GeocoderResult): HotelPlace | null {
  const town = townOf(result.address_components);
  if (!town) return null;
  const country =
    result.address_components.find((c) => c.types.includes("country"))?.short_name ?? null;
  return {
    locationName: town,
    countryCode: country,
    lat: result.geometry.location.lat(),
    lng: result.geometry.location.lng(),
  };
}

async function geocode(
  g: typeof google,
  request: google.maps.GeocoderRequest
): Promise<google.maps.GeocoderResult | null> {
  try {
    const { results } = await new g.maps.Geocoder().geocode(request);
    return results[0] ?? null;
  } catch {
    // ZERO_RESULTS rejects too; either way there is nothing to place.
    return null;
  }
}

/** A hotel's name is often not an address the geocoder understands, but the
 *  Places search finds it - then its coordinate is geocoded for the town. */
function findByName(g: typeof google, name: string): Promise<google.maps.LatLng | null> {
  return new Promise((resolve) => {
    new g.maps.places.PlacesService(document.createElement("div")).findPlaceFromQuery(
      { query: name, fields: ["geometry.location"] },
      (results, status) => {
        const location =
          status === g.maps.places.PlacesServiceStatus.OK
            ? results?.[0]?.geometry?.location
            : undefined;
        resolve(location ?? null);
      }
    );
  });
}

/** Whether lookups can run at all - false without the key or offline. */
export async function canLocateHotels(): Promise<boolean> {
  return (await loadGoogleMaps()) !== null;
}

export async function locateHotel(booking: Booking): Promise<HotelPlace | null> {
  const g = await loadGoogleMaps();
  if (!g) return null;

  const address = addressOf(booking);
  const key = address ?? booking.title;
  if (cache.has(key)) return cache.get(key) ?? null;

  let result = address ? await geocode(g, { address }) : null;
  if (!result && booking.title.trim()) {
    const location = await findByName(g, booking.title.trim());
    if (location) result = await geocode(g, { location });
  }

  const place = result ? toPlace(result) : null;
  cache.set(key, place);
  return place;
}
