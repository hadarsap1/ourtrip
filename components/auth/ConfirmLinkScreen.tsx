"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { resetAuthGate } from "@/components/AuthGate";
import { strings } from "@/lib/strings";

// Where a guest's sign-in link lands (guest-invite, guest-login-link).
//
// The link used to be Supabase's own /verify URL, which signs in on a plain
// GET. WhatsApp fetches every link it sees to draw a preview, so the one-time
// token was spent by the preview before the guest ever tapped it (30/10: a
// guest got "link expired" on the first tap). This page spends nothing on
// load; the token is used only when a person presses the button.
export function ConfirmLinkScreen() {
  const [tokenHash, setTokenHash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.search).get("token_hash");
    // read once from the address bar; there is no server render of it
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTokenHash(hash);
    if (!hash) setError(strings.confirmLink.invalid);
  }, []);

  async function signIn() {
    const supabase = getSupabase();
    if (!supabase || !tokenHash || busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
    if (err) {
      setError(strings.confirmLink.invalid);
      setBusy(false);
      return;
    }
    resetAuthGate();
    // a full load: the gate links the member and the app starts signed in
    window.location.replace(window.location.origin);
  }

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-5 pb-16">
      <div className="ot-postcard mb-8 p-7 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand badge */}
        <img
          src="/sovev/badge-192.png"
          alt=""
          className="relative z-10 mx-auto h-24 w-24 rounded-full border-[3px] border-white/90 object-cover"
        />
        <h1 className="relative z-10 mt-3 text-4xl">{strings.appName}</h1>
      </div>
      {tokenHash && (
        <button
          type="button"
          onClick={() => void signIn()}
          disabled={busy}
          className="rounded-full bg-sea px-8 py-3.5 text-center font-semibold text-on-sea shadow-sm active:bg-sea-deep disabled:opacity-60"
        >
          {busy ? strings.confirmLink.busy : strings.confirmLink.button}
        </button>
      )}
      {error && (
        <div className="mt-5 space-y-3 text-center">
          <p className="text-sm text-rose-600" role="alert">{error}</p>
          <a href="/login" className="text-sm font-semibold text-sea underline">
            {strings.confirmLink.toLogin}
          </a>
        </div>
      )}
    </div>
  );
}
