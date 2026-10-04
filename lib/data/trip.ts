import { getSupabase, storedAuthUserId } from "@/lib/supabase";
import { offlineNow, withTimeout } from "@/lib/offline/network";
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

// The member row is kept on the device too, per signed-in user (F9 again):
// offline, a kid tablet must stay in kid mode and a parent's phone must still
// know it is a parent. Cosmetic role only - RLS checks the real token.
const MEMBER_STORAGE_PREFIX = "ourtrip-member:";

function readStoredMember(uid: string): Member | null {
  try {
    const raw = window.localStorage.getItem(MEMBER_STORAGE_PREFIX + uid);
    return raw ? (JSON.parse(raw) as Member) : null;
  } catch {
    return null;
  }
}

function storeMember(uid: string, member: Member | null) {
  try {
    if (member) window.localStorage.setItem(MEMBER_STORAGE_PREFIX + uid, JSON.stringify(member));
  } catch {
    // storage blocked: online-only behaviour, as before
  }
}

async function sessionUid(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  // Offline, getSession() can spend ~30 s retrying a token refresh and then
  // answer "no session"; the id saved with the login is enough to pick a row.
  if (offlineNow()) return storedAuthUserId();
  try {
    const { data } = await withTimeout(supabase.auth.getSession(), 5000);
    return data.session?.user?.id ?? storedAuthUserId();
  } catch {
    return storedAuthUserId();
  }
}

async function fetchCurrentMember(): Promise<Member | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  // getSession() reads the stored JWT locally; getUser() would spend a round
  // trip revalidating it with the auth server before we can even start the
  // members query. The uid is only used to pick a row - RLS is what actually
  // enforces access, and it validates the token server-side anyway.
  const uid = await sessionUid();
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
  // thing that actually loses them their offline data. Fall back to the copy
  // on this device; with none, throw so the caller can say "no connection".
  if (error) {
    const stored = typeof window !== "undefined" ? readStoredMember(uid) : null;
    if (stored) return stored; // not memoised: the next call tries the network
    throw new Error(error.message);
  }

  cachedMember = data;
  if (typeof window !== "undefined") storeMember(uid, data);
  return data;
}

export async function getCurrentMember(): Promise<Member | null> {
  if (cachedMember) return cachedMember;
  memberInFlight ??= fetchCurrentMember().finally(() => {
    memberInFlight = null;
  });
  return memberInFlight;
}
