// Client orchestration for the Google Photos Picker flow.
//
// The heavy lifting (session create/poll, downloading + caching the picked
// photos) happens in the `gphotos` Edge Function - see supabase/functions.
// The browser's only jobs are (1) get a Google access token via Google
// Identity Services (GIS), scoped to photospicker.mediaitems.readonly, and
// (2) open Google's picker UI so the owner can choose photos.
//
// Split into two steps so the component can open the picker window itself
// (a real user gesture, avoiding popup blockers) between them.

import { getSupabase } from "@/lib/supabase";

const SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";
const GIS_SRC = "https://accounts.google.com/gsi/client";

type TokenClient = { requestAccessToken: (o?: { prompt?: string }) => void };
type TokenResponse = { access_token?: string; error?: string };
type Oauth2 = {
  initTokenClient: (cfg: {
    client_id: string;
    scope: string;
    callback: (resp: TokenResponse) => void;
    error_callback?: () => void;
  }) => TokenClient;
};

/** GIS is loaded from an external script and isn't in our window typings
 *  (window.google is typed as the Maps namespace elsewhere) - reach it by cast. */
function gisOauth2(): Oauth2 | undefined {
  return (
    globalThis as unknown as { google?: { accounts?: { oauth2?: Oauth2 } } }
  ).google?.accounts?.oauth2;
}

export function googleClientId(): string | null {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || null;
}

export function isGooglePhotosConfigured(): boolean {
  return Boolean(googleClientId());
}

let gisPromise: Promise<void> | null = null;

/** Loads the GIS script once. Call on mount so the click handler stays a
 *  clean user gesture (no network await before requesting the token). */
export function preloadGis(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (gisOauth2()) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("gis_load_failed")));
      if (gisOauth2()) resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("gis_load_failed"));
    document.head.appendChild(script);
  });
  return gisPromise;
}

/** Interactive GIS token request (opens Google's consent popup). Must be
 *  reached from within a user gesture. */
function requestGoogleToken(): Promise<string> {
  const clientId = googleClientId();
  if (!clientId) return Promise.reject(new Error("not_configured"));
  return new Promise((resolve, reject) => {
    const oauth2 = gisOauth2();
    if (!oauth2) {
      reject(new Error("gis_not_ready"));
      return;
    }
    const client: TokenClient = oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (resp: TokenResponse) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error ?? "token_failed"));
        } else {
          resolve(resp.access_token);
        }
      },
      error_callback: () => reject(new Error("token_cancelled")),
    });
    client.requestAccessToken();
  });
}

export type PickerSession = {
  sessionId: string;
  pickerUri: string;
  token: string;
  pollSeconds: number;
};

/** Step 1: consent + create a picking session. Returns the URL the owner must
 *  open to pick photos. */
export async function beginPickerSession(): Promise<PickerSession> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  const token = await requestGoogleToken();
  const { data, error } = await supabase.functions.invoke("gphotos", {
    body: { action: "create", googleToken: token },
  });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.error ?? "create_failed");
  return {
    sessionId: data.sessionId,
    pickerUri: data.pickerUri,
    token,
    pollSeconds: data.pollSeconds ?? 5,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Step 2: poll until the owner has finished picking, then import the chosen
 *  photos into the trip under the given country / area. */
export async function finishPickerImport(opts: {
  session: PickerSession;
  country: string | null;
  area: string | null;
  onWaiting?: () => void;
  timeoutMs?: number;
}): Promise<{ imported: number; skipped: number }> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  const { session, country, area } = opts;
  const deadline = Date.now() + (opts.timeoutMs ?? 5 * 60 * 1000);

  let pollSeconds = session.pollSeconds;
  // wait for the picker selection
  for (;;) {
    if (Date.now() > deadline) throw new Error("picker_timeout");
    opts.onWaiting?.();
    const { data, error } = await supabase.functions.invoke("gphotos", {
      body: { action: "poll", sessionId: session.sessionId, googleToken: session.token },
    });
    if (error) throw new Error(error.message);
    if (data?.mediaItemsSet) break;
    if (data?.pollSeconds) pollSeconds = data.pollSeconds;
    await sleep(Math.max(2, pollSeconds) * 1000);
  }

  const { data, error } = await supabase.functions.invoke("gphotos", {
    body: {
      action: "import",
      sessionId: session.sessionId,
      googleToken: session.token,
      country,
      area,
    },
  });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.error ?? "import_failed");
  return { imported: data.imported ?? 0, skipped: data.skipped ?? 0 };
}
