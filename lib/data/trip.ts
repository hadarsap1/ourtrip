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

async function fetchActiveTrip(): Promise<Trip | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase
    .from("trips")
    .select("*")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  cachedTrip = data;
  return data;
}

export async function getActiveTrip(): Promise<Trip | null> {
  if (cachedTrip) return cachedTrip;
  tripInFlight ??= fetchActiveTrip().finally(() => {
    tripInFlight = null;
  });
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
  // members query. The uid is only used to pick a row — RLS is what actually
  // enforces access, and it validates the token server-side anyway.
  const { data: sessionData } = await supabase.auth.getSession();
  const uid = sessionData.session?.user?.id;
  if (!uid) return null;

  const { data } = await supabase
    .from("members")
    .select("*")
    .eq("auth_user_id", uid)
    .limit(1)
    .maybeSingle();
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
