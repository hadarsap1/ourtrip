import { FunctionsHttpError } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import { photoMedia } from "@/lib/data/media";
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
  /** Groups to add; the guest's existing groups are kept. */
  labels: string[] = [],
  /** Sign-in link for a guest already in: nothing on the list changes. */
  loginOnly = false
): Promise<{ link: string; emailed: boolean; already: boolean }> {
  const { data, error } = await requireClient().functions.invoke(
    "guest-invite",
    {
      body: {
        email,
        display_name: displayName,
        redirect_to: window.location.origin,
        ...(labels.length === 0 ? {} : { labels }),
        ...(loginOnly ? { login: true } : {}),
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
  // already: the guest was in before this call, so no welcome email went out
  return { link: data.link as string, emailed: Boolean(data.emailed), already: data.already === true };
}

/** Owner, from the guest card: a fresh sign-in link for an active guest who
 *  lost their way back in. Emailed when it can be, else returned to share. */
export function sendGuestLoginLink(
  email: string,
  displayName: string
): Promise<{ link: string; emailed: boolean; already: boolean }> {
  return inviteGuest(email, displayName, [], true);
}

/** Login screen: ask for a fresh sign-in link (guest-login-link, 00075).
 *  The reply never says whether the email is a guest. */
export async function requestGuestLoginLink(email: string): Promise<void> {
  const { data, error } = await requireClient().functions.invoke("guest-login-link", {
    body: { email, redirect_to: window.location.origin },
  });
  if (error || !data?.ok) throw new Error("login link failed");
}

export async function listAllowlist(
  tripId: string
): Promise<GuestAllowlistRow[]> {
  const { data, error } = await requireClient()
    .from("guests_allowlist")
    .select("*")
    .eq("trip_id", tripId)
    // the test guest of "view as" (00068) is not on the list to manage
    .not("email", "like", "%@preview.ourtrip.app")
    .order("created_at");
  if (error) throw new Error(error.message);
  return data;
}

/** A guest's groups, replaced as a whole (migration 00061). Owner-only by RLS. */
export async function setGuestLabels(
  tripId: string,
  email: string,
  labels: string[]
): Promise<void> {
  const { error } = await requireClient()
    .from("guests_allowlist")
    .update({ labels })
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
  /** was already an active guest: nothing new to tell them */
  already?: boolean;
};

/**
 * One invite at a time, in order: Resend's free tier takes a couple of
 * requests a second, and a class list arriving all at once would trip it.
 * A failure is recorded and the rest carry on.
 */
export async function inviteMany(
  guests: { name: string; email: string }[],
  /** groups to add to each guest; their existing groups are kept */
  labels: string[],
  onProgress: (done: number) => void
): Promise<BulkInviteResult[]> {
  const results: BulkInviteResult[] = [];
  for (const [i, guest] of guests.entries()) {
    try {
      const { link, emailed, already } = await inviteGuest(guest.email, guest.name, labels);
      results.push({ ...guest, ok: true, link, emailed, already });
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

// ---------- kids' names next to a guest's name (00067) ----------

/** A guest's own tag. Only that column, only their own row (checked in the function). */
export async function setMyKidNames(tripId: string, kidNames: string[]): Promise<string[]> {
  const { data, error } = await requireClient().rpc("set_my_kid_names", {
    p_trip_id: tripId,
    p_kid_names: kidNames,
  });
  if (error) throw new Error(error.message);
  return data;
}

/** A parent sets any guest's tag. Owner-only by RLS (members_owner_all). */
export async function setMemberKidNames(memberId: string, kidNames: string[]): Promise<void> {
  const { error } = await requireClient().from("members").update({ kid_names: kidNames }).eq("id", memberId);
  if (error) throw new Error(error.message);
}

// ---------- join link (00054) ----------

/** The trip's join token (created on first call). Never reset from the app:
 *  the link is printed on stickers. Owner-only (checked in the function). */
export async function getJoinToken(tripId: string): Promise<string> {
  const { data, error } = await requireClient().rpc("guest_join_token", {
    p_trip_id: tripId,
  });
  if (error) throw new Error(error.message);
  return data;
}

/** Login screen, before anyone is signed in (00093): the active trip's join
 *  token, so someone never approved can ask to join. null when there is no
 *  join link yet, or on any failure - the screen just shows no "ask to join". */
export async function getOpenJoinToken(): Promise<string | null> {
  const { data, error } = await requireClient().rpc("guest_join_open_token");
  if (error || typeof data !== "string" || data === "") return null;
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
export async function submitJoinRequest(
  token: string,
  name: string,
  email?: string,
  /** the kids this person is a parent of (00067), copied to their tag on approval */
  kidNames: string[] = []
): Promise<SubmitResult> {
  const { data, error } = await requireClient().rpc("submit_guest_join", {
    p_token: token,
    p_name: name,
    ...(email ? { p_email: email } : {}),
    ...(kidNames.length === 0 ? {} : { p_kid_names: kidNames }),
  });
  if (error) throw new Error(error.message);
  return parseSubmitResult(data);
}

// ---------- guest-side photo access (via Edge Function) ----------

export type GuestPhoto = {
  id: string;
  caption: string | null;
  taken_on: string;
  /** the photo, or a video's poster frame (00099) */
  url: string | null;
  /** the video itself; null for a photo */
  videoUrl: string | null;
  /** small copy for grid tiles (00105); null when there is none */
  thumbUrl: string | null;
  // where it was taken (guest-photos, 01/11/2026); absent from an older
  // deployment of the function, so optional
  place?: string | null;
  country_code?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export type GuestAlbumPhoto = GuestPhoto & { album_id: string };

/** The photos a guest may see, signed by guest-photos. Album photos (00087,
 *  #58) belong to their album, so they come apart from the rest. Which photo is in which album comes
 *  from the guest's own RLS read of photos (a shared album only, rule 3),
 *  so the function itself needs no change. listGuestPhotos is the grid. */
export async function listGuestPhotos(): Promise<GuestPhoto[]> {
  return (await listGuestPhotosWithAlbums()).photos;
}

export async function listGuestPhotosWithAlbums(): Promise<{ photos: GuestPhoto[]; albumPhotos: GuestAlbumPhoto[] }> {
  const supabase = requireClient();
  const [fn, inAlbums] = await Promise.all([
    supabase.functions.invoke("guest-photos", { body: {} }),
    supabase.from("photos").select("id, album_id").not("album_id", "is", null),
  ]);
  if (fn.error) throw new Error(fn.error.message);
  if (!fn.data?.ok) throw new Error(fn.data?.error ?? "failed");
  if (inAlbums.error) throw new Error(inAlbums.error.message);
  const albumOf = new Map(inAlbums.data.map((r) => [r.id, r.album_id as string]));
  // video_url: absent from a deployment of the function older than 00099
  // thumb_url: absent from a deployment older than 00105
  const photos = (
    fn.data.photos as (Omit<GuestPhoto, "videoUrl" | "thumbUrl"> & { video_url?: string | null; thumb_url?: string | null })[]
  ).map(({ video_url, thumb_url, ...p }) => ({ ...p, videoUrl: video_url ?? null, thumbUrl: thumb_url ?? null }));
  return {
    photos: photos.filter((p) => !albumOf.has(p.id)),
    albumPhotos: photos.filter((p) => albumOf.has(p.id)).map((p) => ({ ...p, album_id: albumOf.get(p.id)! })),
  };
}

/**
 * The newest few photos a guest may see, for their home. Rows through the
 * guest's own RLS (rule 3: approved AND shared, in their groups; album photos
 * stay in their album, #58), then only those few are signed - the photos
 * screen's call signs every photo of the trip, too much for a home screen.
 */
export async function latestGuestPhotos(limit: number): Promise<GuestPhoto[]> {
  const { data, error } = await requireClient()
    .from("photos")
    .select("id, caption, taken_on")
    .is("album_id", null)
    .order("taken_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const media = await photoMedia("guest", data.map((p) => p.id));
  return data.map((p) => ({
    id: p.id,
    caption: p.caption,
    taken_on: p.taken_on ?? "",
    url: media.get(p.id)?.url ?? null,
    videoUrl: media.get(p.id)?.videoUrl ?? null,
    thumbUrl: media.get(p.id)?.thumbUrl ?? null,
  }));
}

export type GuestGooglePhoto = {
  id: string;
  country: string | null;
  area: string | null;
  filename: string | null;
  url: string | null;
  /** small tile copy (00106); null when there is none - use `thumbUrl ?? url` */
  thumbUrl: string | null;
};

/** Owner-shared Google Photos visible to this guest (via Edge Function). */
export async function listGuestGooglePhotos(): Promise<GuestGooglePhoto[]> {
  const { data, error } = await requireClient().functions.invoke(
    "guest-gphotos",
    { body: {} }
  );
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.error ?? "failed");
  // thumb_url: absent from a deployment of the function older than 00106
  return (data.photos as (Omit<GuestGooglePhoto, "thumbUrl"> & { thumb_url?: string | null })[]).map(
    ({ thumb_url, ...p }) => ({ ...p, thumbUrl: thumb_url ?? null })
  );
}
