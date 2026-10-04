import { getSupabase } from "@/lib/supabase";
import {
  deleteEmergencySnapshot,
  readEmergencySnapshots,
  saveEmergencySnapshots,
} from "@/lib/offline/caches";
import { todayISO } from "@/lib/format";

// Structured content of emergency_info.content (SPEC 2.12). All fields
// optional free text; phone-like fields render as tel: links.
export type EmergencyContent = {
  police?: string;
  ambulance?: string;
  fire?: string;
  embassy_phone?: string;
  embassy_address?: string;
  insurance_company?: string;
  insurance_policy?: string;
  insurance_phone?: string;
  hotel_name?: string;
  hotel_address?: string;
  hotel_phone?: string;
  medical_notes?: string;
};

export type EmergencyPage = {
  countryCode: string;
  content: EmergencyContent;
  updatedAt: string;
};

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

/**
 * All emergency pages. Online: fetches and refreshes the offline cache for
 * every country (acceptance: ALL countries open with network disabled).
 * Offline/failure: served from the cache.
 */
export async function listEmergencyPages(
  tripId: string
): Promise<{ pages: EmergencyPage[]; fromCache: boolean }> {
  try {
    const { data, error } = await requireClient()
      .from("emergency_info")
      .select("*")
      .eq("trip_id", tripId)
      .order("country_code");
    if (error) throw new Error(error.message);
    const pages = data.map((row) => ({
      countryCode: row.country_code,
      content: (row.content ?? {}) as EmergencyContent,
      updatedAt: row.updated_at,
    }));
    await saveEmergencySnapshots(
      pages.map((p) => ({
        countryCode: p.countryCode,
        content: p.content as Record<string, string>,
        updatedAt: p.updatedAt,
      }))
    );
    return { pages, fromCache: false };
  } catch {
    const cached = await readEmergencySnapshots();
    return {
      pages: cached.map((s) => ({
        countryCode: s.countryCode,
        content: s.content as EmergencyContent,
        updatedAt: s.updatedAt,
      })),
      fromCache: true,
    };
  }
}

export async function upsertEmergencyPage(
  tripId: string,
  countryCode: string,
  content: EmergencyContent
): Promise<void> {
  const { error } = await requireClient()
    .from("emergency_info")
    .upsert({ trip_id: tripId, country_code: countryCode, content });
  if (error) throw new Error(error.message);
}

/** Deletes a country's emergency page (owner-only via RLS) and drops its
 *  offline copy. Used to remove a country added by mistake. */
export async function deleteEmergencyPage(
  tripId: string,
  countryCode: string
): Promise<void> {
  const { error } = await requireClient()
    .from("emergency_info")
    .delete()
    .eq("trip_id", tripId)
    .eq("country_code", countryCode);
  if (error) throw new Error(error.message);
  await deleteEmergencySnapshot(countryCode).catch(() => {});
}

/** Auto-fills the country-knowable fields (emergency numbers + Israeli embassy)
 *  via the owner-gated Edge Function; leaves the owner's manual fields intact. */
export async function autofillEmergency(countryCode: string): Promise<void> {
  const { data, error } = await requireClient().functions.invoke(
    "emergency-autofill",
    { body: { country_code: countryCode } }
  );
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.error ?? "autofill failed");
}

/** Fire-and-forget: when a country enters the route, generate its emergency
 *  page if one doesn't exist yet. Owner-only server-side; safe to over-call. */
export async function ensureEmergencyForCountry(
  tripId: string,
  countryCode: string
): Promise<void> {
  if (!tripId || !/^[A-Za-z]{2}$/.test(countryCode)) return;
  const supabase = getSupabase();
  if (!supabase) return;
  const { data } = await supabase
    .from("emergency_info")
    .select("country_code")
    .eq("trip_id", tripId)
    .eq("country_code", countryCode.toUpperCase())
    .maybeSingle();
  if (data) return; // already has a page - don't auto-run
  await autofillEmergency(countryCode.toUpperCase()).catch(() => {});
}

/** Country of today's itinerary day - the default emergency page. */
export async function getTodayCountryCode(tripId: string): Promise<string | null> {
  try {
    const { data } = await requireClient()
      .from("itinerary_days")
      .select("country_code")
      .eq("trip_id", tripId)
      .eq("date", todayISO())
      .maybeSingle();
    return data?.country_code ?? null;
  } catch {
    // offline: today's snapshot may know the country
    const { readTodaySnapshot } = await import("@/lib/offline/caches");
    const snapshot = await readTodaySnapshot();
    return snapshot?.day?.country_code ?? null;
  }
}

const NEXT_COUNTRY_KEY = "ourtrip-current-or-next-country";

/**
 * The country of today's itinerary day, or of the next day that has one
 * (pre-trip this is the first destination, not the alphabetically first page -
 * F5: the screen used to open on Georgia). Cached on the device so it also
 * answers offline.
 */
export async function getCurrentOrNextCountryCode(tripId: string, today = todayISO()): Promise<string | null> {
  try {
    const { data, error } = await requireClient()
      .from("itinerary_days")
      .select("country_code")
      .eq("trip_id", tripId)
      .gte("date", today)
      .not("country_code", "is", null)
      .order("date")
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const code = data?.country_code ?? null;
    try {
      if (code) window.localStorage.setItem(NEXT_COUNTRY_KEY, code);
    } catch {
      // storage blocked: just no offline answer
    }
    return code;
  } catch {
    try {
      return window.localStorage.getItem(NEXT_COUNTRY_KEY);
    } catch {
      return null;
    }
  }
}

/**
 * Which emergency page opens first: today's country, then the current-or-next
 * country, then the first page. A country with no page yet still wins over an
 * unrelated page, so the screen offers to create the right one.
 */
export function pickEmergencyCountry(
  pageCodes: string[],
  todayCountry: string | null,
  currentOrNext: string | null
): string | null {
  for (const c of [todayCountry, currentOrNext]) {
    if (c && pageCodes.includes(c)) return c;
  }
  return todayCountry ?? currentOrNext ?? pageCodes[0] ?? null;
}

/** Countries relevant to the trip: itinerary days ∪ existing pages. */
export async function listCountryOptions(tripId: string): Promise<string[]> {
  const codes = new Set<string>();
  try {
    const { data } = await requireClient()
      .from("itinerary_days")
      .select("country_code")
      .eq("trip_id", tripId)
      .not("country_code", "is", null);
    for (const row of data ?? []) {
      if (row.country_code) codes.add(row.country_code);
    }
  } catch {
    // offline - cached pages below still populate the list
  }
  return [...codes].sort();
}

/** Hebrew country name for an ISO code, falling back to the code itself. */
export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["he"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}
