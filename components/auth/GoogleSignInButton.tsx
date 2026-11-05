"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { gisId, googleClientId, makeNonce, preloadGis } from "@/lib/googleAuth";

// Google sign-in on the app's own origin (GIS button + signInWithIdToken), so
// Google names this site and not <project>.supabase.co. Every failure lands on
// the old redirect flow, which is known to work: no client id, the GIS script
// blocked or slow, or Supabase refusing the token. After a sign-in the page
// reloads at the root, exactly like the redirect flow returns, so the auth
// gate and the join link (remembered token) behave as before.

const GIS_TIMEOUT_MS = 6000;

type Props = {
  /** Text of the fallback button (the redirect flow). */
  label: string;
  className: string;
  /** Runs before either flow leaves the page or signs in (join: remember the token). */
  prepare?: () => void;
  /** "missing_env" when Supabase is not configured, else Supabase's message. */
  onError: (message: string) => void;
};

export function GoogleSignInButton({ label, className, prepare, onError }: Props) {
  const slot = useRef<HTMLDivElement>(null);
  const prepareRef = useRef(prepare);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    prepareRef.current = prepare;
    onErrorRef.current = onError;
  });
  const clientId = googleClientId();
  const [mode, setMode] = useState<"loading" | "gis" | "redirect">(clientId ? "loading" : "redirect");

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) setMode((m) => (m === "loading" ? "redirect" : m));
    }, GIS_TIMEOUT_MS);

    void (async () => {
      try {
        await preloadGis();
        const id = gisId();
        const el = slot.current;
        if (cancelled || !id || !el) throw new Error("gis_unavailable");
        const nonce = await makeNonce();
        id.initialize({
          client_id: clientId,
          nonce: nonce.hashed,
          ux_mode: "popup",
          auto_select: false,
          use_fedcm_for_button: true,
          callback: (resp) => {
            void (async () => {
              const supabase = getSupabase();
              if (!supabase || !resp.credential) {
                await redirectFlow(prepareRef.current, onErrorRef.current);
                return;
              }
              prepareRef.current?.();
              const { error } = await supabase.auth.signInWithIdToken({
                provider: "google",
                token: resp.credential,
                nonce: nonce.raw,
              });
              if (error) {
                // e.g. the client id is not in Supabase's allowed list
                await redirectFlow(prepareRef.current, onErrorRef.current);
                return;
              }
              // full load at the root: the same landing as the redirect flow
              window.location.replace(window.location.origin);
            })();
          },
        });
        id.renderButton(el, {
          type: "standard",
          theme: "filled_blue",
          size: "large",
          shape: "pill",
          text: "continue_with",
          locale: "he",
          width: Math.min(400, Math.max(200, Math.round(el.getBoundingClientRect().width || 320))),
        });
        if (!cancelled) setMode("gis");
      } catch {
        if (!cancelled) setMode("redirect");
      } finally {
        window.clearTimeout(timer);
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [clientId]);

  return (
    <>
      <div
        ref={slot}
        className={mode === "redirect" ? "hidden" : "flex min-h-[52px] w-full justify-center"}
        dir="ltr"
      />
      {mode === "redirect" && (
        <button
          type="button"
          className={className}
          onClick={() => void redirectFlow(prepareRef.current, onErrorRef.current)}
        >
          {label}
        </button>
      )}
    </>
  );
}

/** The old way in: through Supabase's domain, back to the site's root. */
async function redirectFlow(prepare: (() => void) | undefined, onError: (message: string) => void) {
  const supabase = getSupabase();
  if (!supabase) {
    onError("missing_env");
    return;
  }
  prepare?.();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
  if (error) onError(error.message);
}
