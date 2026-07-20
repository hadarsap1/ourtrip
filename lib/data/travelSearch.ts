import { getSupabase } from "@/lib/supabase";

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

// A normalized search result from the `travel-search` Edge Function (ephemeral,
// not yet persisted). One shape for flights and hotels so the same card renders
// both and either can be parked into the bookings list.
export type TravelResult = {
  id: string;
  kind: "flight" | "hotel";
  title: string;
  subtitle: string | null;
  price: number | null;
  currency: string | null;
  link_url: string | null;
  image_url: string | null;
  start_date: string | null;
  end_date: string | null;
  details: Record<string, string>;
};

// Passengers are fixed server-side (2 adults + 2 kids), so they are not part
// of the request — callers only choose route, dates, cabin and currency.
export type FlightSearchParams = {
  origin: string;
  destination: string;
  departure_date: string;
  return_date?: string;
  cabin?: string;
  currency?: string;
};

export type HotelSearchParams = {
  destination: string;
  check_in: string;
  check_out: string;
  currency?: string;
};

// Thrown with a stable code so the UI can map to a specific Hebrew message
// (e.g. missing server key) instead of a generic failure.
export class TravelSearchError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

/** Invokes the owner-gated Edge Function. RapidAPI calls can be slow, so a hard
 *  timeout guards against ever spinning forever (mirrors fetchRecommendations). */
async function invokeSearch(
  body: Record<string, unknown>
): Promise<TravelResult[]> {
  const invoke = requireClient().functions.invoke("travel-search", { body });
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new TravelSearchError("timeout")), 45000)
  );
  const { data, error } = await Promise.race([invoke, timeout]);
  if (error) {
    // Edge Function non-2xx bodies are surfaced via FunctionsHttpError; try to
    // read the structured error code we returned so "not_configured" etc. can
    // become a specific Hebrew message.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const parsed = await ctx.json();
        if (parsed?.error) throw new TravelSearchError(String(parsed.error));
      } catch (e) {
        if (e instanceof TravelSearchError) throw e;
      }
    }
    throw new TravelSearchError(error.message || "search_failed");
  }
  if (!data?.ok) throw new TravelSearchError(data?.error ?? "search_failed");
  return (data.results ?? []) as TravelResult[];
}

export function searchFlights(params: FlightSearchParams): Promise<TravelResult[]> {
  return invokeSearch({ mode: "flights", ...params });
}

export function searchHotels(params: HotelSearchParams): Promise<TravelResult[]> {
  return invokeSearch({ mode: "hotels", ...params });
}
