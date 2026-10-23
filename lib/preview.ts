// "View as a guest / as a kid" (00068). The parent's phone switches to a real
// session of the trip's test member, minted by the preview-session Edge
// Function (parents only), so every screen reads through that role's RLS.
// The parent's own session is put aside on this device and restored on the
// way back - no new sign-in. Both live in localStorage, where supabase-js
// already keeps the parent's session anyway.

import { FunctionsHttpError } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";

export type PreviewRole = "guest" | "kid";
export type PreviewState = { role: PreviewRole; labels: string[] };

const STATE_KEY = "ot-preview";
const RETURN_KEY = "ot-preview-return";

export function readPreview(): PreviewState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PreviewState>;
    if (parsed.role !== "guest" && parsed.role !== "kid") return null;
    return {
      role: parsed.role,
      labels: Array.isArray(parsed.labels) ? parsed.labels.filter((l): l is string => typeof l === "string") : [],
    };
  } catch {
    return null;
  }
}

/** Ask for a test session, keep the parent's aside, switch, start over at home. */
export async function startPreview(role: PreviewRole, labels: string[] = []): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  const { data: current } = await supabase.auth.getSession();
  const parent = current.session;
  if (!parent) throw new Error("no session");

  const { data, error } = await supabase.functions.invoke("preview-session", {
    body: { role, labels: role === "guest" ? labels : [] },
  });
  if (error) {
    const payload =
      error instanceof FunctionsHttpError ? ((await error.context.json().catch(() => ({}))) as { error?: string }) : {};
    throw new Error(payload.error ?? error.message);
  }
  if (!data?.ok) throw new Error(data?.error ?? "preview failed");

  // Without a way back there is no switch: a parent stuck as a guest would
  // have to sign in again from scratch.
  localStorage.setItem(
    RETURN_KEY,
    JSON.stringify({ access_token: parent.access_token, refresh_token: parent.refresh_token })
  );
  localStorage.setItem(STATE_KEY, JSON.stringify({ role, labels: role === "guest" ? labels : [] }));
  const { error: switchError } = await supabase.auth.setSession({
    access_token: data.access_token as string,
    refresh_token: data.refresh_token as string,
  });
  if (switchError) {
    localStorage.removeItem(STATE_KEY);
    localStorage.removeItem(RETURN_KEY);
    throw new Error(switchError.message);
  }
  // a full load: the auth gate, the member store and every screen start over as the test member
  window.location.replace(window.location.origin);
}

/** Back to the parent: end the test session everywhere, restore the parent's. */
export async function stopPreview(): Promise<void> {
  const supabase = getSupabase();
  let back: { access_token: string; refresh_token: string } | null = null;
  try {
    back = JSON.parse(localStorage.getItem(RETURN_KEY) ?? "null");
  } catch {
    back = null;
  }
  let restored = false;
  if (supabase) {
    // the test member's refresh tokens die here, so nothing on this phone can reuse them
    await supabase.auth.signOut({ scope: "global" }).catch(() => {});
    if (back?.refresh_token) {
      const { error } = await supabase.auth.setSession(back);
      restored = !error;
    }
  }
  try {
    localStorage.removeItem(STATE_KEY);
    localStorage.removeItem(RETURN_KEY);
  } catch {
    // nothing to clear
  }
  window.location.replace(window.location.origin + (restored ? "/settings" : "/login"));
}

/** A prefix for device caches, so a preview neither shows nor overwrites the parent's copies. */
export function previewCachePrefix(): string {
  const state = typeof window === "undefined" ? null : readPreview();
  return state ? `preview-${state.role}:` : "";
}
