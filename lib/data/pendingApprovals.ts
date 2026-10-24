import { getSupabase } from "@/lib/supabase";
import { NO_PENDING, type PendingApprovals } from "@/lib/approvals";

/**
 * What waits for a parent, counted in one go: kid stories sent for approval,
 * kid photos and podcast takes still pending (a parent's own upload is
 * approved on the way in), and join requests from the link. `head: true`
 * counts - no rows travel. RLS still applies: join requests are owner-only,
 * so call this for a parent. Any failed count reads 0.
 */
export async function loadPendingApprovals(tripId: string): Promise<PendingApprovals> {
  const supabase = getSupabase();
  if (!supabase) return NO_PENDING;

  const count = async (query: PromiseLike<{ count: number | null }>): Promise<number> => {
    try {
      return (await query).count ?? 0;
    } catch {
      return 0;
    }
  };

  const [stories, photos, episodes, guestRequests] = await Promise.all([
    count(
      supabase.from("posts").select("*", { count: "exact", head: true }).eq("trip_id", tripId).eq("status", "pending")
    ),
    count(
      supabase.from("photos").select("*", { count: "exact", head: true }).eq("trip_id", tripId).eq("status", "pending")
    ),
    count(
      supabase.from("episodes").select("*", { count: "exact", head: true }).eq("trip_id", tripId).eq("status", "pending")
    ),
    count(
      supabase
        .from("guest_join_requests")
        .select("*", { count: "exact", head: true })
        .eq("trip_id", tripId)
        .eq("status", "pending")
    ),
  ]);

  return { stories, photos, episodes, guestRequests };
}
