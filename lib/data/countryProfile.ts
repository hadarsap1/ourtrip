// "הידעת" - the country card: the flag and why it looks that way, population,
// capital, language, currency, size next to Israel, a national symbol. One row
// per country (00089), shown above the facts of every stretch in it.

import { functionErrorCode } from "@/lib/functionError";
import { readQuery, writeQuery } from "@/lib/offline/queryCache";
import { getSupabase } from "@/lib/supabase";
import type { CountryProfile } from "@/lib/types";

function requireClient() {
  const client = getSupabase();
  if (!client) throw new Error("supabase_not_configured");
  return client;
}

/** The lines of the card, in the order they are shown. */
export const PROFILE_FIELDS = [
  "population",
  "capital",
  "language",
  "currency",
  "size_vs_israel",
  "national_symbol",
] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number] | "flag_meaning";

/** "JP" -> 🇯🇵, from the two regional-indicator letters. No image to load, so
 *  it works offline; a code that is not two letters gets no flag. */
export function flagEmoji(countryCode: string): string {
  const code = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(
    ...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  );
}

const cacheKey = (tripId: string, countryCode: string) =>
  `country-profile:${tripId}:${countryCode}`;

/** Falls back to the offline copy: kids read this on planes and in cars. */
export async function getCountryProfile(
  tripId: string,
  countryCode: string
): Promise<{ profile: CountryProfile | null; fromCache: boolean }> {
  try {
    const { data, error } = await requireClient()
      .from("country_profiles")
      .select("*")
      .eq("trip_id", tripId)
      .eq("country_code", countryCode)
      .maybeSingle();
    if (error) throw new Error(error.message);
    await writeQuery(cacheKey(tripId, countryCode), data ?? null);
    return { profile: data ?? null, fromCache: false };
  } catch {
    const cached = await readQuery<CountryProfile | null>(
      cacheKey(tripId, countryCode)
    );
    return { profile: cached?.data ?? null, fromCache: true };
  }
}

/** Owner-gated server-side. Overwrites the whole card. */
export async function generateCountryProfile(countryCode: string): Promise<void> {
  const { data, error } = await requireClient().functions.invoke(
    "country-profile-generate",
    { body: { country_code: countryCode } }
  );
  if (error) {
    throw new Error((await functionErrorCode(error)) ?? "generation failed");
  }
  if (!data?.ok) throw new Error(data?.error ?? "generation failed");
}

/** A parent's edit. Empty lines are stored as null so the card hides them. */
export async function saveCountryProfile(
  tripId: string,
  countryCode: string,
  values: Record<ProfileField, string>,
  memberId: string | null
): Promise<void> {
  const clean = Object.fromEntries(
    Object.entries(values).map(([k, v]) => [k, v.trim() === "" ? null : v.trim()])
  );
  const { error } = await requireClient()
    .from("country_profiles")
    .upsert(
      {
        trip_id: tripId,
        country_code: countryCode,
        ...clean,
        source: "manual",
        updated_by: memberId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "trip_id,country_code" }
    );
  if (error) throw new Error(error.message);
}
