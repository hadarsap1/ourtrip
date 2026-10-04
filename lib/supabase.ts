import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { markReachable, markUnreachable, offlineNow } from "./offline/network";

// Browser-side Supabase client. Returns null when env vars are missing so the
// shell still renders during local development before the project is wired up.
let client: SupabaseClient<Database> | null = null;

// Offline (CLAUDE.md rule #6): on a phone with "no service" a request can hang
// with no answer, and every screen that waits for it hangs too. Each call gets
// a time limit, and with no network at all it fails at once, so the screens'
// existing "failed → device copy" paths run instead of an endless loader.
// Storage is exempt: a document or photo upload on a slow line can take long.
// A timeout also marks the line dead for a while (see lib/offline/network.ts).
export const REQUEST_LIMIT_MS = 10_000;
export const FUNCTION_LIMIT_MS = 60_000;

export function requestLimitFor(url: string): number | null {
  if (url.includes("/storage/v1/")) return null;
  if (url.includes("/functions/v1/")) return FUNCTION_LIMIT_MS;
  return REQUEST_LIMIT_MS;
}

// Every failure we cause is an "AbortError": postgrest-js (2.110+) retries a
// failed GET three times with 1/2/4 s backoff but never retries an abort.
// Without this, offline each read took ~7 s to fail before a screen could
// fall back to its device copy, and a screen with three reads in a row sat on
// its loader for 20+ s (found in QA). Auth treats it as retryable either way,
// so the saved login is kept.
function aborted(reason: string): DOMException {
  return new DOMException(reason, "AbortError");
}

export function guardedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (offlineNow()) return Promise.reject(aborted("offline"));
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const ms = requestLimitFor(url);
  if (ms === null) return fetch(input, init);
  const controller = new AbortController();
  const outer = init?.signal;
  if (outer) {
    if (outer.aborted) controller.abort(outer.reason);
    else outer.addEventListener("abort", () => controller.abort(outer.reason), { once: true });
  }
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(aborted("timeout"));
  }, ms);
  return fetch(input, { ...init, signal: controller.signal }).then(
    (res) => {
      clearTimeout(timer);
      markReachable();
      return res;
    },
    (err: unknown) => {
      clearTimeout(timer);
      if (timedOut) {
        markUnreachable();
        throw aborted("timeout");
      }
      // A plain network failure ("Failed to fetch"): same - fail once, fast.
      if (err instanceof TypeError) throw aborted(err.message);
      throw err;
    }
  );
}

// supabase-js's own default key, spelled out so storedAuthUserId reads the
// same slot (changing it would sign everyone out).
function authStorageKey(url: string): string {
  return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
}

export function getSupabase(): SupabaseClient<Database> | null {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  client = createClient(url, anonKey, {
    auth: { storageKey: authStorageKey(url) },
    global: { fetch: guardedFetch },
  });
  return client;
}

/**
 * The signed-in user's id from the session saved on this device, with no
 * network and no token refresh. Offline, once the 1-hour access token has
 * expired, supabase-js cannot renew it and getSession() answers "no session"
 * even though the login is still on the phone. This lets the offline screens
 * keep working; it grants nothing - every server read still goes through RLS
 * with the real token.
 */
export function storedAuthUserId(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(authStorageKey(url));
    if (!raw) return null;
    const s = JSON.parse(raw) as { user?: { id?: unknown }; refresh_token?: unknown };
    // A slot without a refresh token is not a usable login.
    if (typeof s.refresh_token !== "string") return null;
    return typeof s.user?.id === "string" ? s.user.id : null;
  } catch {
    return null;
  }
}
