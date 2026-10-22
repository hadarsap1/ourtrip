import { getSupabase } from "@/lib/supabase";
import { withDefaultGroups } from "@/lib/audience";
import { strings } from "@/lib/strings";
import type { Member } from "@/lib/types";

// Guest groups as audiences (migrations 00063, 00064). The groups are the
// guests' labels (00061): a guest is in one or more of them, and whoever
// writes or uploads chooses everyone or some of them.

/**
 * The groups this member can address: parents and kids - the basic groups
 * (משפחה, חברים, the kids' classes) plus every other group on the guest list;
 * a guest - their own. The database enforces the same for guests (my_groups,
 * messages_guest_insert); this only decides which tabs and choices to show.
 */
export async function listMyGroups(role: Member["role"]): Promise<string[]> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  const { data, error } = await supabase.rpc("my_groups");
  if (error) throw new Error(error.message);
  return withDefaultGroups(data ?? [], role, strings.guests.labelSuggestions);
}
