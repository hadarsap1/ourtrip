import { getSupabase } from "@/lib/supabase";
import { getCurrentMember } from "@/lib/data/trip";

// push_subscriptions rows are self-scoped by RLS (member_id = current_member).
// One row per browser endpoint; re-subscribing on the same device upserts.

export async function saveSubscription(sub: PushSubscription): Promise<void> {
  const supabase = getSupabase();
  const member = await getCurrentMember();
  if (!supabase || !member) throw new Error("unavailable");

  const json = sub.toJSON();
  const keys = json.keys ?? {};
  if (!json.endpoint || !keys.p256dh || !keys.auth) {
    throw new Error("incomplete subscription");
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      member_id: member.id,
      endpoint: json.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
    { onConflict: "endpoint" }
  );
  if (error) throw new Error(error.message);
}

export async function deleteSubscription(endpoint: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}
