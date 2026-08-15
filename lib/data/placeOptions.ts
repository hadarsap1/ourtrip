// "בנק אפשרויות" — the options bank. One row per candidate place (hotel,
// restaurant, attraction) the owners are considering for a destination,
// however it arrived: typed in by hand, pulled out of a Facebook post, or
// saved from the AI recommender.
//
// Replaces saved_links + saved_recommendations, which were two half-versions
// of this same idea split by how the item was created.
//
// Owner-only (RLS policy place_options_owner_all) — planning content is never
// visible to kids or guests.

import { createBooking } from "@/lib/data/bookings";
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
 *  more mid-trip without a migration — this list only drives the picker. */
export const PLACE_CATEGORIES = [
  "hotel",
  "restaurant",
  "attraction",
  "activity",
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

/** Bulk insert — used when saving several candidates extracted from one post. */
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
 *  The option deliberately stays in the bank rather than being deleted — the
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
};

/** Sends pasted post text to the extract-places Edge Function, which asks
 *  Claude for structured candidates. Nothing is saved here — the caller shows
 *  the candidates and saves whichever the owner ticks. */
export async function extractPlacesFromText(
  text: string,
  hints: { country: string | null; area: string | null }
): Promise<ExtractedPlace[]> {
  const { data, error } = await requireClient().functions.invoke(
    "extract-places",
    { body: { text, country: hints.country, area: hints.area } }
  );
  // Rethrow the function's own error code, not supabase-js's generic message,
  // so the UI can tell "no API key" and "no balance" apart from "try again".
  if (error) throw new Error((await functionErrorCode(error)) ?? "failed");
  const places = (data as { places?: ExtractedPlace[] } | null)?.places;
  return places ?? [];
}
