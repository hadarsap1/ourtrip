// The guests' join link (migration 00054, DECISIONS #37). One link per trip,
// posted in the family / class WhatsApp group; whoever opens it asks to join
// and a parent approves. Pure helpers here; the calls are in lib/data/guests.

import { strings } from "@/lib/strings";

export type JoinStatus = "member" | "pending" | null;
/** googleOnly: the token is the login screen's open one (00095) - a request
 *  through it must come from a signed-in Google account. */
export type JoinInfo = { valid: boolean; status: JoinStatus; googleOnly: boolean };
export type SubmitResult = "pending" | "member" | "invalid" | "bad_input" | "busy" | "google_only";

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
 * The WhatsApp message after approval. The app's address is the link to keep
 * (Hadar 15/11/2026): still signed in, they are in; if not, Google or their
 * email on the login screen. A typed address also gets its one-time sign-in
 * link for the first time in, since the email did not go out.
 */
export function approvedShareText(
  guest: ApprovedGuest,
  origin: string,
  /** a sign-in link for a guest already in, not an approval */
  login = false
): string {
  const name = guest.name.trim();
  const appUrl = `${origin.replace(/\/+$/, "")}/`;
  if (guest.viaGoogle) {
    return (login ? strings.guests.loginGoogleText : strings.guests.approvedGoogleText)
      .replace("{name}", name)
      .replace("{email}", guest.email)
      .replace("{url}", appUrl);
  }
  return (login ? strings.guests.loginLinkText : strings.guests.approvedLinkText)
    .replace("{name}", name)
    .replace("{appUrl}", appUrl)
    .replace("{email}", guest.email)
    .replace("{url}", guest.link);
}

/** What guest_join_info returned, narrowed; anything unexpected is invalid. */
export function parseJoinInfo(raw: unknown): JoinInfo {
  const obj = (raw ?? {}) as { valid?: unknown; status?: unknown; google_only?: unknown };
  const status = obj.status === "member" || obj.status === "pending" ? obj.status : null;
  return { valid: obj.valid === true, status, googleOnly: obj.google_only === true };
}

const RESULTS: SubmitResult[] = ["pending", "member", "invalid", "bad_input", "busy", "google_only"];
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
