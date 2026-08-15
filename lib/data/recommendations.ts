import { getSupabase } from "@/lib/supabase";
import { functionErrorCode } from "@/lib/functionError";
import { getCurrentMember } from "@/lib/data/trip";
import type { PlaceOption } from "@/lib/types";

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

// A recommendation as returned by the `recommend` Edge Function (ephemeral,
// not yet persisted). Shares fields with saved_recommendations so a saved row
// and a fresh suggestion render through the same card.
export type Recommendation = {
  title: string;
  category: string | null;
  description: string | null;
  location_name: string | null;
  lat: number | null;
  lng: number | null;
  place_id: string | null;
  country_code: string | null;
  maps_url: string | null;
};

export type RecommendParams = {
  lat?: number | null;
  lng?: number | null;
  area_name?: string | null;
  country_code?: string | null;
  categories?: string[] | null;
};

/** Invokes the owner-gated Edge Function (Anthropic + Places). Usually a few
 *  seconds; a hard timeout guards against ever spinning forever. */
export async function fetchRecommendations(
  params: RecommendParams
): Promise<Recommendation[]> {
  const invoke = requireClient().functions.invoke("recommend", {
    body: {
      lat: params.lat ?? null,
      lng: params.lng ?? null,
      area_name: params.area_name ?? null,
      country_code: params.country_code ?? null,
      categories: params.categories ?? null,
    },
  });
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), 45000)
  );
  const { data, error } = await Promise.race([invoke, timeout]);
  // supabase-js hides the function's JSON body behind error.context — without
  // this the UI can never distinguish "no API key" from a transient failure.
  if (error) throw new Error((await functionErrorCode(error)) ?? "recommend failed");
  if (!data?.ok) throw new Error(data?.error ?? "recommend failed");
  return (data.recommendations ?? []) as Recommendation[];
}

// The maybe-list now lives in place_options alongside manually-added and
// Facebook-extracted options — one bank per destination rather than a separate
// AI-only list (00020_place_options.sql). These three keep their names and
// shapes so the recommend screen is unchanged apart from the row type.

export async function listSavedRecommendations(
  tripId: string
): Promise<PlaceOption[]> {
  const { data, error } = await requireClient()
    .from("place_options")
    .select("*")
    .eq("trip_id", tripId)
    .eq("source", "ai")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Parks a recommendation on the maybe-list (an option in the bank). */
export async function saveRecommendation(
  tripId: string,
  rec: Recommendation
): Promise<void> {
  const member = await getCurrentMember();
  const { error } = await requireClient().from("place_options").insert({
    trip_id: tripId,
    title: rec.title,
    category: rec.category,
    // The bank calls this `note`; the recommender produces a `description`.
    note: rec.description,
    location_name: rec.location_name,
    lat: rec.lat,
    lng: rec.lng,
    place_id: rec.place_id,
    country_code: rec.country_code,
    maps_url: rec.maps_url,
    source: "ai",
    created_by: member?.id ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function deleteSavedRecommendation(id: string): Promise<void> {
  const { error } = await requireClient()
    .from("place_options")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** One-tap "save into the itinerary": appends an item to a day (SPEC 2.8). */
export async function addRecommendationToDay(
  dayId: string,
  rec: Recommendation
): Promise<void> {
  const supabase = requireClient();
  const { data: existing } = await supabase
    .from("itinerary_items")
    .select("sort_order")
    .eq("day_id", dayId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

  const { error } = await supabase.from("itinerary_items").insert({
    day_id: dayId,
    title: rec.title,
    location_name: rec.location_name,
    lat: rec.lat,
    lng: rec.lng,
    place_id: rec.place_id,
    notes: rec.description,
    sort_order: nextOrder,
  });
  if (error) throw new Error(error.message);
}
