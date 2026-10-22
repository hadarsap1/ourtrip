import { getSupabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";
import type { Member } from "@/lib/types";

// Guest groups as audiences (migration 00063). The groups themselves are the
// guests' labels (00061); a group can be linked to the kid it belongs to.

export type GroupKid = Tables<"guest_group_kids">;

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

/**
 * The groups this member can address and read:
 *   owner - every group on the guest list or linked to a kid
 *   kid   - the groups linked to them
 *   guest - their own groups (an active guest only)
 * The database enforces the same (my_guest_labels / my_kid_labels); this only
 * decides which tabs and choices to show.
 */
export async function listMyGroups(tripId: string, role: Member["role"]): Promise<string[]> {
  const supabase = requireClient();
  if (role === "owner") {
    const [{ data: rows, error }, { data: kids, error: kidsError }] = await Promise.all([
      supabase.from("guests_allowlist").select("labels").eq("trip_id", tripId),
      supabase.from("guest_group_kids").select("label").eq("trip_id", tripId),
    ]);
    if (error || kidsError) throw new Error((error ?? kidsError)!.message);
    return [...new Set([...rows.flatMap((r) => r.labels), ...kids.map((k) => k.label)])];
  }
  const { data, error } = await supabase.rpc(role === "kid" ? "my_kid_labels" : "my_guest_labels");
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Which kid each group belongs to. Owner-only by RLS. */
export async function listGroupKids(tripId: string): Promise<GroupKid[]> {
  const { data, error } = await requireClient()
    .from("guest_group_kids")
    .select("*")
    .eq("trip_id", tripId);
  if (error) throw new Error(error.message);
  return data;
}

/** Links a group to a kid, or unlinks it (null). Owner-only by RLS; the
 *  database refuses anyone but a kid of the trip. */
export async function setGroupKid(tripId: string, label: string, kidId: string | null): Promise<void> {
  const supabase = requireClient();
  const { error } = kidId
    ? await supabase
        .from("guest_group_kids")
        .upsert({ trip_id: tripId, label, member_id: kidId }, { onConflict: "trip_id,label" })
    : await supabase.from("guest_group_kids").delete().eq("trip_id", tripId).eq("label", label);
  if (error) throw new Error(error.message);
}
