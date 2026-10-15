import { FunctionsHttpError } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";
import { parseJoinInfo, parseSubmitResult, type JoinInfo, type SubmitResult } from "@/lib/guestJoin";

export type GuestAllowlistRow = Tables<"guests_allowlist">;
export type JoinRequestRow = Tables<"guest_join_requests">;

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
  /** undefined leaves each existing guest's label as it is */
  label: string | null | undefined,
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

// ---------- join link (00054) ----------

/** The trip's join token (created on first call). reset = a new link; the
 *  old one stops working. Owner-only (checked in the function). */
export async function getJoinToken(tripId: string, reset = false): Promise<string> {
  const { data, error } = await requireClient().rpc("guest_join_token", {
    p_trip_id: tripId,
    p_reset: reset,
  });
  if (error) throw new Error(error.message);
  return data;
}

/** Open requests, oldest first. Owner-only by RLS. */
export async function listJoinRequests(tripId: string): Promise<JoinRequestRow[]> {
  const { data, error } = await requireClient()
    .from("guest_join_requests")
    .select("*")
    .eq("trip_id", tripId)
    .eq("status", "pending")
    .order("requested_at");
  if (error) throw new Error(error.message);
  return data;
}

/** Approving is inviteGuest(): the allowlist trigger marks the request
 *  approved. Declining only closes it; the asker is not told. */
export async function declineJoinRequest(id: string, memberId: string): Promise<void> {
  const { error } = await requireClient()
    .from("guest_join_requests")
    .update({ status: "declined", decided_at: new Date().toISOString(), decided_by: memberId })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Anyone with the link (signed in or not). */
export async function getJoinInfo(token: string): Promise<JoinInfo> {
  const { data, error } = await requireClient().rpc("guest_join_info", { p_token: token });
  if (error) throw new Error(error.message);
  return parseJoinInfo(data);
}

/** Signed in with Google, the address comes from the login and email is ignored. */
export async function submitJoinRequest(token: string, name: string, email?: string): Promise<SubmitResult> {
  const { data, error } = await requireClient().rpc("submit_guest_join", {
    p_token: token,
    p_name: name,
    ...(email ? { p_email: email } : {}),
  });
  if (error) throw new Error(error.message);
  return parseSubmitResult(data);
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
