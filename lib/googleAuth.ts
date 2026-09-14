// Shared Google Identity Services (GIS) plumbing.
//
// Extracted from lib/gphotos/picker.ts when a second feature needed a Google
// access token: the Photos picker asks for photospicker.mediaitems.readonly,
// the booking import asks for gmail.readonly. Everything except the scope is
// identical, and a second copy of the script loader would mean two <script>
// tags racing for the same global.
//
// The token is obtained in the browser and handed to an Edge Function for the
// duration of one request. NOTHING IS STORED - no refresh token, no server-side
// credential, nothing in localStorage. That is the deliberate trade: the app
// can read the mailbox only while the owner is in front of it and has just
// consented, and there is no standing key to a mailbox sitting in the database.

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

let gisPromise: Promise<void> | null = null;

/** Loads the GIS script once. Call on mount so the click handler stays a
 *  clean user gesture (no network await before requesting the token). */
export function preloadGis(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (gisOauth2()) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GIS_SRC}"]`
    );
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

/** Interactive GIS token request for one scope (opens Google's consent popup).
 *  Must be reached from within a user gesture. */
export function requestGoogleToken(scope: string): Promise<string> {
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
      scope,
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
