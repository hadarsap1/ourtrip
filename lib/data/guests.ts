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
  displayName: string,
  /** Group label; undefined leaves an existing guest's label as it is. */
  label?: string | null
): Promise<{ link: string; emailed: boolean }> {
  const { data, error } = await requireClient().functions.invoke(
    "guest-invite",
    {
      body: {
        email,
        display_name: displayName,
        redirect_to: window.location.origin,
        ...(label === undefined ? {} : { label }),
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

/** Group label for managing the list (migration 00043). Owner-only by RLS. */
export async function setGuestLabel(
  tripId: string,
  email: string,
  label: string | null
): Promise<void> {
  const { error } = await requireClient()
    .from("guests_allowlist")
    .update({ label })
    .eq("trip_id", tripId)
    .eq("email", email);
  if (error) throw new Error(error.message);
}

export type BulkInviteResult = {
  email: string;
  name: string;
  ok: boolean;
  link?: string;
  emailed?: boolean;
};

/**
 * One invite at a time, in order: Resend's free tier takes a couple of
 * requests a second, and a class list arriving all at once would trip it.
 * A failure is recorded and the rest carry on.
 */
export async function inviteMany(
  guests: { name: string; email: string }[],
  label: string | null,
  onProgress: (done: number) => void
): Promise<BulkInviteResult[]> {
  const results: BulkInviteResult[] = [];
  for (const [i, guest] of guests.entries()) {
    try {
      const { link, emailed } = await inviteGuest(guest.email, guest.name, label);
      results.push({ ...guest, ok: true, link, emailed });
    } catch {
      results.push({ ...guest, ok: false });
    }
    onProgress(i + 1);
    if (i < guests.length - 1) await new Promise((r) => setTimeout(r, 600));
  }
  return results;
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
