import { getSupabase } from "@/lib/supabase";
import {
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

/** Country of today's itinerary day — the default emergency page. */
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
    // offline — cached pages below still populate the list
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
