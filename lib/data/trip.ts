import { getSupabase } from "@/lib/supabase";
import type { Member, Trip } from "@/lib/types";

// The app manages a single active trip (DECISIONS #8: no multi-trip UI).
// Both values are stable for a session, so cache after first fetch.
let cachedTrip: Trip | null = null;
let cachedMember: Member | null = null;

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
