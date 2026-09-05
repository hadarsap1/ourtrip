import { FunctionsHttpError } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";

export type GuestAllowlistRow = Tables<"guests_allowlist">;

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

/** Owner invites (or re-invites, clearing revocation). Returns the magic
 *  link + whether it was emailed via Resend. */
export async function inviteGuest(
  email: string,
  displayName: string
): Promise<{ link: string; emailed: boolean }> {
  const { data, error } = await requireClient().functions.invoke(
    "guest-invite",
    {
      body: {
        email,
        display_name: displayName,
        redirect_to: window.location.origin,
      },
    }
  );
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = (await error.context.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(payload.error ?? "invite failed");
    }
    throw new Error(error.message);
  }
  if (!data?.ok) throw new Error(data?.error ?? "invite failed");
  return { link: data.link as string, emailed: Boolean(data.emailed) };
}

export async function listAllowlist(
  tripId: string
): Promise<GuestAllowlistRow[]> {
  const { data, error } = await requireClient()
    .from("guests_allowlist")
    .select("*")
    .eq("trip_id", tripId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return data;
}

/** Sets revoked_at - every guest policy re-checks it per query, so access
 *  disappears immediately (Sprint 7 acceptance). */
export async function revokeGuest(tripId: string, email: string): Promise<void> {
  const { error } = await requireClient()
    .from("guests_allowlist")
    .update({ revoked_at: new Date().toISOString() })
    .eq("trip_id", tripId)
    .eq("email", email);
  if (error) throw new Error(error.message);
}

// ---------- guest-side photo access (via Edge Function) ----------

export type GuestPhoto = {
  id: string;
  caption: string | null;
  taken_on: string;
  url: string | null;
};

export async function listGuestPhotos(): Promise<GuestPhoto[]> {
  const { data, error } = await requireClient().functions.invoke(
    "guest-photos",
    { body: {} }
  );
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.error ?? "failed");
  return data.photos as GuestPhoto[];
}

export type GuestGooglePhoto = {
  id: string;
  country: string | null;
  area: string | null;
  filename: string | null;
  url: string | null;
};

/** Owner-shared Google Photos visible to this guest (via Edge Function). */
export async function listGuestGooglePhotos(): Promise<GuestGooglePhoto[]> {
  const { data, error } = await requireClient().functions.invoke(
    "guest-gphotos",
    { body: {} }
  );
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.error ?? "failed");
  return data.photos as GuestGooglePhoto[];
}
