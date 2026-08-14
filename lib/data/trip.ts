import { getSupabase } from "@/lib/supabase";
import type { Member, MemberName, Trip } from "@/lib/types";

// The app manages a single active trip (DECISIONS #8: no multi-trip UI).
// Both values are stable for a session, so cache after first fetch.
let cachedTrip: Trip | null = null;
let cachedMember: Member | null = null;

/** Drops the module-level caches. Called on sign-out so the next session on
 *  this device never resolves the previous person's trip or role. */
export function clearTripCache(): void {
  cachedTrip = null;
  cachedMember = null;
}

export async function getActiveTrip(): Promise<Trip | null> {
  if (cachedTrip) return cachedTrip;
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

/**
 * Names of everyone on the trip, for resolving a sender/author/assignee id
 * into something readable.
 *
 * Reads the `trip_member_names` view rather than `members` (audit P-2): the
 * table row carries email addresses, and the wall needs names. The view exposes
 * four columns and is scoped to the caller's own trip in the database, so this
 * is not a client-side narrowing that a hand-written request could widen.
 */
export async function listMemberNames(tripId: string): Promise<MemberName[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data } = await supabase
    .from("trip_member_names")
    .select("*")
    .eq("trip_id", tripId)
    .order("display_name");
  return data ?? [];
}

export async function getCurrentMember(): Promise<Member | null> {
  if (cachedMember) return cachedMember;
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
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
