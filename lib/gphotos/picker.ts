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
//
// The GIS script loading and the token request itself live in lib/googleAuth.ts
// - the Gmail booking import needs exactly the same dance under a different
// scope, and two copies would mean two <script> tags racing for one global.

import { getSupabase } from "@/lib/supabase";
import { googleClientId, preloadGis, requestGoogleToken } from "@/lib/googleAuth";

const SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";

export { preloadGis, googleClientId };

export function isGooglePhotosConfigured(): boolean {
  return Boolean(googleClientId());
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
  const token = await requestGoogleToken(SCOPE);
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
