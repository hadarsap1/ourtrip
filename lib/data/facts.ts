// "הידעת" - short facts about each destination, for the kids to read.
//
// A destination is a STRETCH of the itinerary, (country_code, location_name),
// not a country: the trip visits Japan as eight separate places and Thailand
// as one 38-day block, so country-level facts would give a kid the same
// handful of items for 38 days. Migration 00032 has the reasoning.

import { countryName } from "@/lib/data/emergency";
import { functionErrorCode } from "@/lib/functionError";
import { readFactsSnapshot, saveFactsSnapshot } from "@/lib/offline/caches";
import { getSupabase } from "@/lib/supabase";
import type { DestinationFact } from "@/lib/types";

function requireClient() {
  const client = getSupabase();
  if (!client) throw new Error("supabase_not_configured");
  return client;
}

export type Destination = {
  countryCode: string;
  locationName: string;
  days: number;
  from: string;
  to: string;
};

/** Stable identity for a destination, used as the offline cache key and as a
 *  React key. The separator cannot appear in a country code. */
export function destinationKey(countryCode: string, locationName: string): string {
  return `${countryCode}::${locationName}`;
}

/**
 * Splits a stretch label into the country it is in and the area within it.
 *
 * WHY. The itinerary was imported with inconsistent names: Japan's stretches
 * are called "קיוטו", "טוקיו", "האקונה" with no country, while the others are
 * called "תאילנד", "קמבודיה", "וייטנאם - צפון". Printing location_name as-is
 * therefore named the country for most of the trip and only the city for
 * Japan. The country is not missing from the data - itinerary_days.country_code
 * has it for every row - it was simply never used for the label.
 *
 * So the country always comes from country_code, and the area is whatever the
 * label adds on top of it. "וייטנאם - צפון" in VN becomes country וייטנאם,
 * area צפון; "קיוטו" in JP becomes country יפן, area קיוטו; and "תאילנד" in TH
 * is the country itself, so there is no area to show rather than the name
 * printed twice.
 */
export function splitDestinationLabel(
  countryCode: string,
  locationName: string
): { country: string; area: string | null } {
  const country = countryName(countryCode);
  const label = locationName.trim();

  // Intl returns "הפיליפינים" while the itinerary says "פיליפינים", so the
  // definite article cannot be part of the comparison.
  const bare = (v: string) => (v.startsWith("ה") ? v.slice(1) : v).trim();
  const candidates = [country, bare(country)];

  for (const name of candidates) {
    if (name === "" ) continue;
    if (bare(label) === name || label === name) return { country, area: null };
    if (label.startsWith(name)) {
      const rest = label.slice(name.length);
      const trimmed = rest.replace(/^[\s\-,:־]+/, "").trim();
      // Only when a separator was actually consumed, so a country name would
      // never swallow the start of a longer word. A label that is the country
      // plus a dangling separator has no area rather than an empty one.
      if (rest === "" || trimmed !== rest) {
        return { country, area: trimmed === "" ? null : trimmed };
      }
    }
  }

  return { country, area: label === "" ? null : label };
}

/**
 * Picks the fact to show on a given date.
 *
 * Deterministic on purpose. Both kids have their own tablet, and a random pick
 * would show them different facts on the same day - which turns "did you know"
 * into an argument rather than something they tell each other. Rotating by the
 * date means the card changes daily, both tablets agree, and it does not need
 * anything stored to remember where it got to.
 */
export function pickFactOfDay<T>(facts: T[], dateISO: string): T | null {
  if (facts.length === 0) return null;
  const ms = Date.parse(`${dateISO}T00:00:00Z`);
  if (Number.isNaN(ms)) return facts[0];
  const dayNumber = Math.floor(ms / 86_400_000);
  // JS % keeps the sign of the dividend, and dates before 1970 are negative.
  const index = ((dayNumber % facts.length) + facts.length) % facts.length;
  return facts[index];
}

/** The stretches of the trip, in date order, each with its span. */
export async function listDestinations(tripId: string): Promise<Destination[]> {
  const { data, error } = await requireClient()
    .from("itinerary_days")
    .select("date, country_code, location_name")
    .eq("trip_id", tripId)
    .order("date");
  if (error) throw new Error(error.message);

  const byKey = new Map<string, Destination>();
  for (const row of data ?? []) {
    if (!row.country_code || !row.location_name) continue;
    const key = destinationKey(row.country_code, row.location_name);
    const found = byKey.get(key);
    if (found) {
      found.days += 1;
      if (row.date > found.to) found.to = row.date;
      if (row.date < found.from) found.from = row.date;
    } else {
      byKey.set(key, {
        countryCode: row.country_code,
        locationName: row.location_name,
        days: 1,
        from: row.date,
        to: row.date,
      });
    }
  }
  return [...byKey.values()].sort((a, b) => a.from.localeCompare(b.from));
}

/**
 * Where the kids are today - or, before the trip starts, where they are going
 * first. Returning the first stretch rather than nothing means the card has
 * something to show during the whole pre-departure window, which is when they
 * are most curious about it.
 */
export function destinationForDate(
  destinations: Destination[],
  todayISO: string
): Destination | null {
  if (destinations.length === 0) return null;
  const current = destinations.find((d) => d.from <= todayISO && todayISO <= d.to);
  if (current) return current;
  const upcoming = destinations.find((d) => d.from > todayISO);
  return upcoming ?? destinations[destinations.length - 1];
}

/** One destination's facts. Falls back to the offline copy, which is the point:
 *  kids read these on planes and in cars. */
export async function listFacts(
  tripId: string,
  countryCode: string,
  locationName: string
): Promise<{ facts: DestinationFact[]; fromCache: boolean }> {
  const key = destinationKey(countryCode, locationName);
  try {
    const { data, error } = await requireClient()
      .from("destination_facts")
      .select("*")
      .eq("trip_id", tripId)
      .eq("country_code", countryCode)
      .eq("location_name", locationName)
      .order("sort_order");
    if (error) throw new Error(error.message);
    await saveFactsSnapshot({
      key,
      facts: (data ?? []).map((f) => ({
        id: f.id,
        fact: f.fact,
        emoji: f.emoji,
      })),
    });
    return { facts: data ?? [], fromCache: false };
  } catch {
    const snapshot = await readFactsSnapshot(key);
    if (!snapshot) return { facts: [], fromCache: true };
    return {
      facts: snapshot.facts.map((f, i) => ({
        ...f,
        trip_id: tripId,
        country_code: countryCode,
        location_name: locationName,
        sort_order: i,
        source: "ai",
        created_by: null,
        created_at: "",
      })),
      fromCache: true,
    };
  }
}

/** How many facts each destination already has, for the owner's list. */
export async function countFactsByDestination(
  tripId: string
): Promise<Map<string, number>> {
  const { data, error } = await requireClient()
    .from("destination_facts")
    .select("country_code, location_name")
    .eq("trip_id", tripId);
  if (error) throw new Error(error.message);
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const key = destinationKey(row.country_code, row.location_name);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Owner-gated server-side. Replaces the AI batch, keeps hand-written facts. */
export async function generateFacts(
  countryCode: string,
  locationName: string
): Promise<number> {
  const { data, error } = await requireClient().functions.invoke(
    "facts-generate",
    { body: { country_code: countryCode, location_name: locationName } }
  );
  if (error) {
    throw new Error((await functionErrorCode(error)) ?? "generation failed");
  }
  if (!data?.ok) throw new Error(data?.error ?? "generation failed");
  return Number(data.count ?? 0);
}

export async function addFact(
  tripId: string,
  countryCode: string,
  locationName: string,
  fact: string,
  emoji: string | null,
  memberId: string | null
): Promise<DestinationFact> {
  const { data, error } = await requireClient()
    .from("destination_facts")
    .insert({
      trip_id: tripId,
      country_code: countryCode,
      location_name: locationName,
      fact,
      emoji,
      source: "manual",
      created_by: memberId,
      // Hand-written facts go last, so a regenerate never reshuffles them.
      sort_order: 1000,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateFact(
  id: string,
  fact: string,
  emoji: string | null
): Promise<void> {
  const { error } = await requireClient()
    .from("destination_facts")
    .update({ fact, emoji })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteFact(id: string): Promise<void> {
  const { error } = await requireClient()
    .from("destination_facts")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}
