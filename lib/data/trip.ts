import { getSupabase } from "@/lib/supabase";
import type { Member, Trip } from "@/lib/types";

// The app manages a single active trip (DECISIONS #8: no multi-trip UI).
// Both values are stable for a session, so cache after first fetch.
//
// The cache alone wasn't enough: every screen, plus BottomNav and AuthGate,
// asks for these while mounting, and a cache that fills only on *resolution*
// let each of those fire its own identical request. Keeping the in-flight
// promise collapses them into one round-trip.
let cachedTrip: Trip | null = null;
let tripInFlight: Promise<Trip | null> | null = null;
let cachedMember: Member | null = null;
let memberInFlight: Promise<Member | null> | null = null;

// The trip row is also kept on the device (F9): with no network the query
// fails, and without a trip id no screen could show its cached data. RLS still
// guards every data query, so a stale id on a shared device exposes nothing.
const TRIP_STORAGE_KEY = "ourtrip-active-trip";

function readStoredTrip(): Trip | null {
  try {
    const raw = window.localStorage.getItem(TRIP_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Trip) : null;
  } catch {
    return null;
  }
}

function storeTrip(trip: Trip | null) {
  try {
    if (trip) window.localStorage.setItem(TRIP_STORAGE_KEY, JSON.stringify(trip));
  } catch {
    // storage blocked: online-only behaviour, as before
  }
}

async function fetchActiveTrip(): Promise<Trip | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("trips")
      .select("*")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    cachedTrip = data;
    storeTrip(data);
    return data;
  } catch {
    // Offline or the request failed: fall back to the last trip seen here.
    // Not memoised, so the next call tries the network again.
    return readStoredTrip();
  }
}

export async function getActiveTrip(): Promise<Trip | null> {
  if (cachedTrip) return cachedTrip;
  tripInFlight ??= fetchActiveTrip().finally(() => {
    tripInFlight = null;
  });
  // Cache-first (F9): a trip already stored on this device answers at once,
  // so screens can paint their cached data while the network catches up.
  // There is one active trip (DECISIONS #8), so the stored row is the same
  // one the fetch is about to return.
  if (typeof window !== "undefined") {
    const stored = readStoredTrip();
    if (stored) return stored;
  }
  return tripInFlight;
}

/** All members of the trip (owners see everyone via members_owner_all). */
export async function listMembers(tripId: string): Promise<Member[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data } = await supabase
    .from("members")
    .select("*")
    .eq("trip_id", tripId)
    .order("display_name");
  return data ?? [];
}

async function fetchCurrentMember(): Promise<Member | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  // getSession() reads the stored JWT locally; getUser() would spend a round
  // trip revalidating it with the auth server before we can even start the
  // members query. The uid is only used to pick a row - RLS is what actually
  // enforces access, and it validates the token server-side anyway.
  const { data: sessionData } = await supabase.auth.getSession();
  const uid = sessionData.session?.user?.id;
  if (!uid) return null;

  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("auth_user_id", uid)
    .limit(1)
    .maybeSingle();

  // A failed lookup is NOT "we could not identify you". Swallowing the error
  // and returning null made every screen that gates on a member tell the
  // family their session had expired and offer a sign-in link - on a trip
  // where the usual reason is a dead connection, and signing out is the one
  // thing that actually loses them their offline data. Throw instead, so the
  // caller can say "no connection" and offer a retry.
  if (error) throw new Error(error.message);

  cachedMember = data;
  return data;
}

export async function getCurrentMember(): Promise<Member | null> {
  if (cachedMember) return cachedMember;
  memberInFlight ??= fetchCurrentMember().finally(() => {
    memberInFlight = null;
  });
  return memberInFlight;
}
