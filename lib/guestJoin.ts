// The guests' join link (migration 00054, DECISIONS #37). One link per trip,
// posted in the family / class WhatsApp group; whoever opens it asks to join
// and a parent approves. Pure helpers here; the calls are in lib/data/guests.

import { strings } from "@/lib/strings";

export type JoinStatus = "member" | "pending" | null;
export type JoinInfo = { valid: boolean; status: JoinStatus };
export type SubmitResult = "pending" | "member" | "invalid" | "bad_input" | "busy";

/** The link that is shared: the short /j/ path, redirected to /join/ (next.config.ts). */
export function joinUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/j/${encodeURIComponent(token)}`;
}

export function joinShareText(url: string): string {
  return strings.guests.joinShareText.replace("{url}", url);
}

/** Someone a parent just approved, whose email did not go out. */
export type ApprovedGuest = { name: string; email: string; link: string; viaGoogle: boolean };

/**
 * The WhatsApp message after approval. A Google sign-up gets the app's address
 * (they sign in with Google - nothing to expire); a typed address gets its
 * personal sign-in link, which expires, so the message says to tap it now.
 */
export function approvedShareText(guest: ApprovedGuest, origin: string): string {
  const name = guest.name.trim();
  if (guest.viaGoogle) {
    return strings.guests.approvedGoogleText
      .replace("{name}", name)
      .replace("{email}", guest.email)
      .replace("{url}", `${origin.replace(/\/+$/, "")}/`);
  }
  return strings.guests.approvedLinkText.replace("{name}", name).replace("{url}", guest.link);
}

/** What guest_join_info returned, narrowed; anything unexpected is invalid. */
export function parseJoinInfo(raw: unknown): JoinInfo {
  const obj = (raw ?? {}) as { valid?: unknown; status?: unknown };
  const status = obj.status === "member" || obj.status === "pending" ? obj.status : null;
  return { valid: obj.valid === true, status };
}

const RESULTS: SubmitResult[] = ["pending", "member", "invalid", "bad_input", "busy"];
export function parseSubmitResult(raw: unknown): SubmitResult {
  return RESULTS.includes(raw as SubmitResult) ? (raw as SubmitResult) : "invalid";
}

/** The name a Google login carries, else the part of the address before @. */
export function nameFromGoogle(metadata: Record<string, unknown> | undefined, email: string | undefined): string {
  const fromMeta = [metadata?.full_name, metadata?.name].find(
    (v): v is string => typeof v === "string" && v.trim() !== ""
  );
  return (fromMeta ?? email?.split("@")[0] ?? "").trim().slice(0, 60);
}

// Google sign-in returns to the site's root (the one redirect URL the auth
// settings are known to allow), so the token rides in localStorage and the
// auth gate sends the person back to /join/<token> instead of turning them
// away. It stays until they are let in, so reopening the app while waiting
// lands on the "waiting for approval" page rather than "not allowed".
const KEY = "ot-join-token";

export function rememberJoinToken(token: string): void {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    // private mode: the Google path then lands on the root and can retry from the link
  }
}

export function rememberedJoinToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function forgetJoinToken(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(KIDS_KEY);
  } catch {
    // nothing to forget
  }
}

// The kids' names typed before the Google button (00067) ride the same trip
// out and back, so the request sent on return still carries them.
const KIDS_KEY = "ot-join-kids";

export function rememberJoinKids(names: string[]): void {
  try {
    localStorage.setItem(KIDS_KEY, JSON.stringify(names));
  } catch {
    // private mode: the request goes without them; the guest can add them later
  }
}

export function rememberedJoinKids(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KIDS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === "string") : [];
  } catch {
    return [];
  }
}
