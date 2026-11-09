// Guests' views of updates, photos and episodes (00085). Guests record their
// own through record_content_view (RLS: only what they can see); parents read
// the trip's rows. Kids neither write nor read.

import { getSupabase } from "@/lib/supabase";
import type { ContentView } from "@/lib/types";
import type { PendingView } from "@/lib/views";

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

export async function saveView(view: PendingView): Promise<void> {
  const t = view.target;
  const { error } = await requireClient().rpc("record_content_view", {
    ...("postId" in t ? { p_post_id: t.postId } : "photoId" in t ? { p_photo_id: t.photoId } : { p_episode_id: t.episodeId }),
    p_heard_seconds: Math.round(view.heardSeconds),
    p_at: view.at,
  });
  if (error) throw new Error(error.message);
}

/** Every guest view of the trip. RLS: parents only (a guest gets their own). */
export async function listViews(tripId: string): Promise<ContentView[]> {
  const { data, error } = await requireClient().from("content_views").select("*").eq("trip_id", tripId);
  if (error) throw new Error(error.message);
  return data;
}
