import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { markNetworkFailed as flagNetworkFailed, markReachable, markUnreachable, networkDown, offlineNow } from "./offline/network";

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

// While the line is down, check it every PROBE_MS with a tiny request, so the
// offline banner goes away once requests get through again even on a screen
// that is not loading anything (the next real response clears it too).
export const PROBE_MS = 15_000;
let probeTimer: ReturnType<typeof setInterval> | null = null;

function startProbe(): void {
  if (probeTimer || typeof window === "undefined") return;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return;
  probeTimer = setInterval(() => {
    if (!networkDown()) {
      if (probeTimer) clearInterval(probeTimer);
      probeTimer = null;
      return;
    }
    void guardedFetch(`${url}/auth/v1/health`, { headers: { apikey: anonKey } }).catch(() => {});
  }, PROBE_MS);
}

function markNetworkFailed(): void {
  flagNetworkFailed();
  startProbe();
}

export function guardedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (offlineNow()) return Promise.reject(aborted("offline"));
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const ms = requestLimitFor(url);
  if (ms === null)
    return fetch(input, init).then(
      (res) => {
        markReachable();
        return res;
      },
      (err: unknown) => {
        if (err instanceof TypeError) markNetworkFailed();
        throw err;
      }
    );
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
        startProbe();
        throw aborted("timeout");
      }
      // A plain network failure ("Failed to fetch"): same - fail once, fast.
      if (err instanceof TypeError) {
        markNetworkFailed();
        throw aborted(err.message);
      }
      throw err;
    }
  );
}

// One screen load asks the database the same thing from several places at
// once: the member row from the gate, the bar and the screen; the "waiting for
// approval" counts from the bar and the home card (QA 15/11/2026: 47 requests
// on the parents' home, a dozen of them repeats). Every request pays the trip
// to the database's region, so identical reads that are in the air at the same
// moment share one request. Reads only, same address and same headers (so the
// same person, the same count / range options), and only while the first is
// still in flight - nothing is cached, a later read always goes out.
const inFlight = new Map<string, Promise<Response>>();
const SHARED_HEADERS = ["authorization", "prefer", "range", "accept", "accept-profile"];

export function sharedReadFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if ((method !== "GET" && method !== "HEAD") || !url.includes("/rest/v1/") || init?.signal) {
    return guardedFetch(input, init);
  }
  const headers = new Headers(init?.headers);
  const key = [method, url, ...SHARED_HEADERS.map((h) => headers.get(h) ?? "")].join("\n");
  let pending = inFlight.get(key);
  if (!pending) {
    pending = guardedFetch(input, init).finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }
  // each caller reads its own copy of the body
  return pending.then((res) => res.clone());
}

// supabase-js's own default key, spelled out so storedAuthUserId reads the
// same slot (changing it would sign everyone out).
function authStorageKey(url: string): string {
  return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
}

// Media the device keeps by storage path (public/sw.js, egress fix
// 24/11/2026). Must match MEDIA_CACHE there.
export const MEDIA_CACHE = "ourtrip-media-v1";

const signedOutHandlers = new Set<() => void>();

/** Runs `fn` whenever this device signs out (in-memory caches of what the
 *  last account was allowed to see). */
export function onSignedOut(fn: () => void): void {
  signedOutHandlers.add(fn);
}

function handleSignedOut(): void {
  for (const fn of signedOutHandlers) fn();
  // the next account on this phone fetches its own copies
  if (typeof caches !== "undefined") void caches.delete(MEDIA_CACHE).catch(() => {});
}

export function getSupabase(): SupabaseClient<Database> | null {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  client = createClient(url, anonKey, {
    auth: { storageKey: authStorageKey(url) },
    global: { fetch: sharedReadFetch },
  });
  client.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") handleSignedOut();
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
