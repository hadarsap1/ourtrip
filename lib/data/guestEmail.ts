import { getSupabase } from "@/lib/supabase";
import { getCurrentMember } from "@/lib/data/trip";

// A guest's daily email (00101, DECISIONS #72). guest_email_optins is own-row
// only for an active guest (select / insert / delete); the token and the
// last-sent time are the database's. Unsubscribing from the email link needs
// no sign-in: unsubscribe_guest_email(token).

export async function getMyEmailDigest(): Promise<boolean> {
  const supabase = getSupabase();
  const member = await getCurrentMember();
  if (!supabase || !member) throw new Error("unavailable");
  const { data, error } = await supabase
    .from("guest_email_optins")
    .select("member_id")
    .eq("member_id", member.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data !== null;
}

export async function setMyEmailDigest(on: boolean): Promise<void> {
  const supabase = getSupabase();
  const member = await getCurrentMember();
  if (!supabase || !member) throw new Error("unavailable");
  if (on) {
    const { error } = await supabase
      .from("guest_email_optins")
      .insert({ member_id: member.id, trip_id: member.trip_id });
    // already on (from another device): fine
    if (error && error.code !== "23505") throw new Error(error.message);
  } else {
    const { error } = await supabase.from("guest_email_optins").delete().eq("member_id", member.id);
    if (error) throw new Error(error.message);
  }
}

/** From the email's link, signed in or not. false = already off or a bad link. */
export async function unsubscribeEmailDigest(token: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("unavailable");
  const { data, error } = await supabase.rpc("unsubscribe_guest_email", { p_token: token });
  if (error) throw new Error(error.message);
  return data === true;
}
