// "בנק אפשרויות" - the options bank. One row per candidate place (hotel,
// restaurant, attraction) the owners are considering for a destination,
// however it arrived: typed in by hand, pulled out of a Facebook post, or
// saved from the AI recommender.
//
// Replaces saved_links + saved_recommendations, which were two half-versions
// of this same idea split by how the item was created.
//
// Owner-only (RLS policy place_options_owner_all) - planning content is never
// visible to kids or guests.

import { createBooking } from "@/lib/data/bookings";
import { createItem } from "@/lib/data/itinerary";
import { functionErrorCode } from "@/lib/functionError";
import { getSupabase } from "@/lib/supabase";
import type { Booking, PlaceOption, PlaceOptionStatus } from "@/lib/types";
import type { TablesInsert } from "@/lib/database.types";

function requireClient() {
  const client = getSupabase();
  if (!client) throw new Error("supabase_not_configured");
  return client;
}

/** Categories the UI offers. Stored as free text, so the family can invent
 *  more mid-trip without a migration - this list only drives the picker. */
export const PLACE_CATEGORIES = [
  "hotel",
  "restaurant",
  "attraction",
  "activity",
  "city",
  "nature",
  "transport",
  "shop",
  "other",
] as const;

export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

export async function listPlaceOptions(tripId: string): Promise<PlaceOption[]> {
  const { data, error } = await requireClient()
    .from("place_options")
    .select("*")
    .eq("trip_id", tripId)
    .order("country", { ascending: true, nullsFirst: false })
    .order("area", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type PlaceOptionInput = {
  title: string;
  category: string | null;
  country: string | null;
  countryCode?: string | null;
  area: string | null;
  note: string | null;
  sourceUrl: string | null;
  bookingUrl: string | null;
  source?: string;
  locationName?: string | null;
  lat?: number | null;
  lng?: number | null;
  placeId?: string | null;
  mapsUrl?: string | null;
};

/** Accepts what a person actually pastes ("booking.com/x", with or without a
 *  scheme) and returns something an href can use. Mirrors normalizeUrl in
 *  lib/data/links.ts, which this module replaces. */
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function toRow(
  tripId: string,
  input: PlaceOptionInput,
  memberId: string | null
): TablesInsert<"place_options"> {
  const blank = (v: string | null | undefined) => {
    const t = v?.trim();
    return t ? t : null;
  };
  return {
    trip_id: tripId,
    title: input.title.trim(),
    category: blank(input.category),
    country: blank(input.country),
    country_code: blank(input.countryCode),
    area: blank(input.area),
    note: blank(input.note),
    source: input.source ?? "manual",
    source_url: input.sourceUrl ? normalizeUrl(input.sourceUrl) : null,
    booking_url: input.bookingUrl ? normalizeUrl(input.bookingUrl) : null,
    location_name: blank(input.locationName),
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    place_id: blank(input.placeId),
    maps_url: blank(input.mapsUrl),
    created_by: memberId,
  };
}

export async function createPlaceOption(
  tripId: string,
  input: PlaceOptionInput,
  memberId: string | null
): Promise<void> {
  const { error } = await requireClient()
    .from("place_options")
    .insert(toRow(tripId, input, memberId));
  if (error) throw new Error(error.message);
}

/** Bulk insert - used when saving several candidates extracted from one post. */
export async function createPlaceOptions(
  tripId: string,
  inputs: PlaceOptionInput[],
  memberId: string | null
): Promise<void> {
  if (inputs.length === 0) return;
  const { error } = await requireClient()
    .from("place_options")
    .insert(inputs.map((i) => toRow(tripId, i, memberId)));
  if (error) throw new Error(error.message);
}

export async function updatePlaceOption(
  id: string,
  input: PlaceOptionInput
): Promise<void> {
  const row = toRow("", input, null);
  // trip_id / created_by are set at creation and must not be rewritten here.
  delete (row as Partial<TablesInsert<"place_options">>).trip_id;
  delete (row as Partial<TablesInsert<"place_options">>).created_by;
  const { error } = await requireClient()
    .from("place_options")
    .update(row)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setPlaceOptionStatus(
  id: string,
  status: PlaceOptionStatus
): Promise<void> {
  const { error } = await requireClient()
    .from("place_options")
    .update({ status })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deletePlaceOption(id: string): Promise<void> {
  const { error } = await requireClient()
    .from("place_options")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Maps an option's free-text category onto the bookings enum. Anything the
 *  enum doesn't cover books as 'other' rather than failing the insert. */
export function bookingTypeForCategory(
  category: string | null
): Booking["type"] {
  switch (category) {
    case "hotel":
      return "hotel";
    case "attraction":
    case "activity":
      return "attraction";
    case "transport":
      return "train";
    default:
      return "other";
  }
}

/** Promote an option into a real booking: creates the booking, then marks the
 *  option 'booked' and links the two.
 *
 *  The option deliberately stays in the bank rather than being deleted - the
 *  fact that this hotel was one of four considered is planning history worth
 *  keeping, and the booking FK is ON DELETE SET NULL so cancelling a booking
 *  leaves the option behind rather than erasing it. */
export async function promoteToBooking(
  option: PlaceOption,
  fields: { startDate: string | null; endDate: string | null; notes: string | null }
): Promise<Booking> {
  const booking = await createBooking({
    trip_id: option.trip_id,
    title: option.title,
    type: bookingTypeForCategory(option.category),
    status: "booked",
    start_date: fields.startDate,
    end_date: fields.endDate,
    link_url: option.booking_url ?? option.source_url,
    notes: fields.notes,
  });

  const { error } = await requireClient()
    .from("place_options")
    .update({ status: "booked", booking_id: booking.id })
    .eq("id", option.id);
  // The booking exists at this point; surface the link failure rather than
  // pretending the promotion fully succeeded.
  if (error) throw new Error(error.message);

  return booking;
}

export type ExtractedPlace = {
  title: string;
  category: string | null;
  area: string | null;
  note: string | null;
  /** A link the post itself gave for this place. Null when the post named no
   *  URL - the model is told never to invent one. */
  url: string | null;
};

/** A Google Maps search link for a place, built from its name and area.
 *
 *  Deterministic and keyless: it is a search URL, not a resolved place, so it
 *  cannot point at the wrong business the way a guessed place id could, and it
 *  needs no Places API call. Maps resolves "<name> <area> <country>" to the
 *  right pin in practice, and degrades to a sensible search when it can't.
 *  Works for any script, so Hebrew and Vietnamese names are both fine. */
export function mapsSearchUrl(
  title: string,
  area?: string | null,
  country?: string | null
): string | null {
  const query = [title, area, country]
    .map((p) => p?.trim())
    .filter((p): p is string => !!p)
    .join(" ");
  if (query === "") return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** The cuts the bank can be sliced by. Every field is optional; an unset field
 *  means "don't filter on this". Shared by the list and the map so both always
 *  show the same set - a pin that isn't in the list would be a lie. */
export type OptionFilter = {
  category?: string | null;
  status?: PlaceOptionStatus | null;
  country?: string | null;
  area?: string | null;
  /** Map view only: drop options with no coordinates, since they can't be pinned. */
  locatedOnly?: boolean;
  /** Hide what has been rejected.
   *
   *  Rejecting an option was doing almost nothing visible: the row still drew a
   *  pin and still counted toward "N places have no location", so the one
   *  action available for the ~15 rows that are not places at all - 12go Asia,
   *  Vietnam Airlines, an ethnic group the extractor swept out of a post -
   *  never actually cleared them off the map. The screen sets this whenever the
   *  reader is not deliberately looking AT the rejected pile. */
  excludeRejected?: boolean;
};

const sameLabel = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/** Applies every set cut. Pure, so the list, the map and the counts can't drift
 *  apart. Country and area compare case- and whitespace-insensitively because
 *  they are free text a person types. */
export function filterOptions(
  options: PlaceOption[],
  filter: OptionFilter
): PlaceOption[] {
  return options.filter((o) => {
    if (filter.category && o.category !== filter.category) return false;
    if (filter.status && o.status !== filter.status) return false;
    if (filter.country && !sameLabel(o.country, filter.country)) return false;
    if (filter.area && !sameLabel(o.area, filter.area)) return false;
    if (filter.locatedOnly && (o.lat == null || o.lng == null)) return false;
    if (filter.excludeRejected && o.status === "rejected") return false;
    return true;
  });
}

/** Bounding box of a set of located options, for fitting the map to whatever
 *  the current cut selects. Null when nothing in the set has coordinates. */
export function boundsOf(
  options: PlaceOption[]
): { north: number; south: number; east: number; west: number } | null {
  const located = options.filter((o) => o.lat != null && o.lng != null);
  if (located.length === 0) return null;
  const lats = located.map((o) => o.lat!);
  const lngs = located.map((o) => o.lng!);
  return {
    north: Math.max(...lats),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    west: Math.min(...lngs),
  };
}

export type ExtractResult = {
  places: ExtractedPlace[];
  /** True when at least one chunk of a long post hit the model's output
   *  ceiling, so the list may be short of a few places. The caller warns
   *  rather than silently presenting a partial list as complete. */
  partial: boolean;
};

/** Sends pasted post text to the extract-places Edge Function, which asks
 *  Claude for structured candidates. Nothing is saved here - the caller shows
 *  the candidates and saves whichever the owner ticks. */
/** Asks the geocode-places function to resolve one batch of not-yet-located
 *  options into coordinates. Returns how many are still pending so the caller
 *  can loop with a progress indicator rather than blocking on the whole set. */
export async function geocodePlaceOptions(
  tripId: string
): Promise<{ located: number; failed: number; remaining: number }> {
  const { data, error } = await requireClient().functions.invoke(
    "geocode-places",
    { body: { trip_id: tripId } }
  );
  if (error) throw new Error((await functionErrorCode(error)) ?? "failed");
  const payload = data as
    | { located?: number; failed?: number; remaining?: number }
    | null;
  return {
    located: payload?.located ?? 0,
    failed: payload?.failed ?? 0,
    remaining: payload?.remaining ?? 0,
  };
}

/** Clears the failure counter on everything still unlocated.
 *
 *  geocode-places skips a row once it has failed GEOCODE_MAX_ATTEMPTS times, so
 *  a name nothing can resolve stops eating a slot in every batch. That is right
 *  for the automatic loop and wrong for a deliberate tap: without this, the
 *  button would report "done" while the screen still said 49 places have no
 *  pin, which reads as broken. A tap means "try these again", so it does. */
export async function resetGeocodeAttempts(tripId: string): Promise<void> {
  const { error } = await requireClient()
    .from("place_options")
    .update({ geocode_attempts: 0 })
    .eq("trip_id", tripId)
    .is("lat", null)
    .gt("geocode_attempts", 0)
    // A rejected option is not worth a lookup. Leaving its counter exhausted
    // is what keeps it out of the batch, without the Edge Function needing to
    // know about statuses at all.
    .neq("status", "rejected");
  if (error) throw new Error(error.message);
}

export async function extractPlacesFromText(
  text: string,
  hints: { country: string | null; area: string | null }
): Promise<ExtractResult> {
  const { data, error } = await requireClient().functions.invoke(
    "extract-places",
    { body: { text, country: hints.country, area: hints.area } }
  );
  // Rethrow the function's own error code, not supabase-js's generic message,
  // so the UI can tell "no API key" and "no balance" apart from "try again".
  if (error) throw new Error((await functionErrorCode(error)) ?? "failed");
  const payload = data as { places?: ExtractedPlace[]; partial?: boolean } | null;
  return { places: payload?.places ?? [], partial: payload?.partial === true };
}

// ---------------------------------------------------------------------------
// The day pulls from the bank (migration 00029).
//
// Measured 2026-09-04: 343 options, every one still status 'option'. Not a
// single row had ever left, because the only exit was promoteToBooking() -
// right for a hotel, useless for the attractions, restaurants and viewpoints
// that are most of the bank. Everything below exists to give an option
// somewhere to go in one tap, from the screen where the decision is actually
// made: a day.
// ---------------------------------------------------------------------------

/** Great-circle distance in km. Sorting a few hundred options client-side is
 *  cheaper than a PostGIS dependency for a bank this size (CLAUDE.md rule #7). */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type DayOption = PlaceOption & {
  /** km from the day's own location, when both ends are known. */
  distanceKm: number | null;
};

/** Orders the bank for one day: options already tagged with this day's area
 *  first, then by distance from where the day actually is, then everything
 *  with no coordinates. A place we cannot locate is still worth offering -
 *  the cleanup migrations left a batch of those waiting to be re-geocoded -
 *  it just cannot claim to be nearby. */
export function rankForDay(
  options: PlaceOption[],
  day: { area?: string | null; location_name: string | null; lat: number | null; lng: number | null }
): DayOption[] {
  const origin =
    day.lat != null && day.lng != null ? { lat: day.lat, lng: day.lng } : null;
  const dayArea = (day.area ?? day.location_name ?? "").trim().toLowerCase();

  return options
    .map((o) => ({
      ...o,
      distanceKm:
        origin && o.lat != null && o.lng != null
          ? distanceKm(origin, { lat: o.lat, lng: o.lng })
          : null,
    }))
    .sort((a, b) => {
      const aArea = dayArea !== "" && (a.area ?? "").trim().toLowerCase() === dayArea;
      const bArea = dayArea !== "" && (b.area ?? "").trim().toLowerCase() === dayArea;
      if (aArea !== bArea) return aArea ? -1 : 1;
      if (a.distanceKm == null) return b.distanceKm == null ? 0 : 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm;
    });
}

/** The undecided bank for one country. Anything already planned, booked or
 *  rejected is left out: the picker is for deciding, not for browsing. */
export async function listOptionsForCountry(
  tripId: string,
  countryCode: string | null
): Promise<PlaceOption[]> {
  let q = requireClient()
    .from("place_options")
    .select("*")
    .eq("trip_id", tripId)
    .in("status", ["option", "shortlist"]);
  // A day with no country still gets the whole undecided bank rather than
  // nothing, which is the more useful failure.
  if (countryCode) q = q.eq("country_code", countryCode);
  const { data, error } = await q.order("title");
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Categories that belong outdoors, so the rain alert (SPEC 2.7) can warn
 *  about them without anyone ticking a box by hand. */
function isOutdoorCategory(category: string | null): boolean {
  return category === "nature" || category === "activity";
}

/**
 * The missing exit: turn an option into an item on a day.
 *
 * Deliberately NOT a booking. You do not reserve a viewpoint, and requiring a
 * booking is exactly why 343 options never moved. The option stays in the bank
 * marked 'planned' and linked to the item it became, mirroring how
 * promoteToBooking leaves it behind marked 'booked' - planning history is kept
 * either way, and 00029's FK is ON DELETE SET NULL so removing the item from
 * the day does not erase that the place was considered.
 */
export async function planFromOption(
  option: PlaceOption,
  dayId: string,
  sortOrder: number
): Promise<string> {
  const itemId = await createItem({
    day_id: dayId,
    title: option.title,
    location_name: option.location_name ?? option.area ?? null,
    lat: option.lat,
    lng: option.lng,
    place_id: option.place_id,
    notes: option.note,
    is_outdoor: isOutdoorCategory(option.category),
    sort_order: sortOrder,
  });

  const { error } = await requireClient()
    .from("place_options")
    .update({ status: "planned", itinerary_item_id: itemId })
    .eq("id", option.id);
  if (error) throw new Error(error.message);

  return itemId;
}

/** Undoes planFromOption from the bank's side: the option becomes undecided
 *  again. The itinerary item is left alone - deleting it is the itinerary
 *  screen's business, and 00029 nulls the link automatically if that happens. */
export async function unplanOption(id: string): Promise<void> {
  const { error } = await requireClient()
    .from("place_options")
    .update({ status: "option", itinerary_item_id: null })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export type AreaTally = {
  /** Itinerary days whose location matches this area. */
  days: number;
  options: number;
  planned: number;
};

/** Per-area counts for the bank's headers.
 *
 *  This is the line that makes a bank of hundreds feel finite: "הוי אן · 3
 *  ימים · 41 אפשרויות · 2 במסלול" tells you at a glance that the area needs
 *  deciding, while an area with no planned days can be ignored entirely.
 *  Without it every area looks identical and there is no reason to start
 *  anywhere.
 *
 *  Matching is by name because that is all the two tables share: a day carries
 *  `location_name`, an option carries `area`. Migration 00030 canonicalised the
 *  area spellings, which is what makes this comparison meaningful at all - it
 *  would have missed two thirds of Hoi An when the town was spelled three ways.
 */
export function tallyByArea(
  options: PlaceOption[],
  days: { location_name: string | null }[]
): Map<string, AreaTally> {
  const key = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

  const dayCounts = new Map<string, number>();
  for (const day of days) {
    const k = key(day.location_name);
    if (k === "") continue;
    dayCounts.set(k, (dayCounts.get(k) ?? 0) + 1);
  }

  const tally = new Map<string, AreaTally>();
  for (const option of options) {
    const k = key(option.area);
    if (k === "") continue;
    const entry = tally.get(k) ?? {
      days: dayCounts.get(k) ?? 0,
      options: 0,
      planned: 0,
    };
    entry.options += 1;
    if (option.status === "planned") entry.planned += 1;
    tally.set(k, entry);
  }
  return tally;
}

export type DayOptionGroup = {
  /** null groups everything with no area at all. */
  area: string | null;
  options: DayOption[];
};

/**
 * Groups the day's candidates by area, best group first.
 *
 * WHY GROUPING RATHER THAN A FLAT NEAREST-FIRST LIST. rankForDay orders by
 * distance from `itinerary_days.lat/lng`, and on this trip **no day has
 * coordinates at all** - checked live 2026-09-05, all 227 rows. Worse, the days
 * are 14 long stretches rather than towns: 38 days called "תאילנד", 35 called
 * "וייטנאם - דרום ומרכז". So the area match misses too, and the picker was
 * showing Vietnam's 229 options as one unordered scroll.
 *
 * A person planning "וייטנאם - צפון" does not want 229 rows sorted by nothing.
 * They want to open הוי אן, see its 41, and pick. Grouping works with the data
 * that exists instead of the data the ranking assumed.
 */
export function groupForDay(
  options: PlaceOption[],
  day: { location_name: string | null; lat: number | null; lng: number | null }
): DayOptionGroup[] {
  const ranked = rankForDay(options, day);
  const dayArea = (day.location_name ?? "").trim().toLowerCase();

  const byArea = new Map<string, DayOption[]>();
  for (const option of ranked) {
    const key = (option.area ?? "").trim();
    const list = byArea.get(key);
    if (list) list.push(option);
    else byArea.set(key, [option]);
  }

  return [...byArea.entries()]
    .map(([area, list]) => ({ area: area === "" ? null : area, options: list }))
    .sort((a, b) => {
      // The stretch's own name first when it happens to match an area.
      const aMatch = dayArea !== "" && (a.area ?? "").toLowerCase() === dayArea;
      const bMatch = dayArea !== "" && (b.area ?? "").toLowerCase() === dayArea;
      if (aMatch !== bMatch) return aMatch ? -1 : 1;
      // Then the areas with the most to choose from, since those are where the
      // planning actually happens. Unfiled options sink to the bottom.
      if ((a.area === null) !== (b.area === null)) return a.area === null ? 1 : -1;
      return b.options.length - a.options.length;
    });
}

/**
 * The batch form of planFromOption: several options onto one day in one go.
 *
 * The picker used to close after a single pick, so putting four places on a day
 * meant opening it four times. Sort order continues from what the day already
 * holds, so the new items land after the existing ones rather than on top.
 */
export async function planFromOptions(
  options: PlaceOption[],
  dayId: string,
  startSortOrder: number
): Promise<number> {
  let order = startSortOrder;
  let planned = 0;
  for (const option of options) {
    await planFromOption(option, dayId, order);
    order += 1;
    planned += 1;
  }
  return planned;
}
