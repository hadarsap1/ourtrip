import { getSupabase } from "@/lib/supabase";

// Guest groups as audiences (migrations 00063, 00064). The groups are the
// guests' labels (00061): a guest is in one or more of them, and whoever
// writes or uploads chooses everyone or some of them.

/**
 * The groups this member can address: parents and kids - every group on the
 * guest list; a guest - their own. The database enforces the same (my_groups,
 * messages_guest_insert); this only decides which tabs and choices to show.
 */
export async function listMyGroups(): Promise<string[]> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  const { data, error } = await supabase.rpc("my_groups");
  if (error) throw new Error(error.message);
  return data ?? [];
}
