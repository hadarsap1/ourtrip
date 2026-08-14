"use client";

import { useState } from "react";
import { signOutAndWipe } from "@/lib/data/session";
import { strings } from "@/lib/strings";

/**
 * Sign-out with the device wipe SPEC §2.5 requires. Destructive and
 * irreversible in one direction — offline documents have to be re-downloaded
 * afterwards, and a kid tablet needs a fresh pairing code — so it confirms
 * first and says plainly what disappears.
 */
export function SignOutRow() {
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    if (busy) return;
    if (!confirm(strings.auth.signOutConfirm)) return;
    setBusy(true);
    await signOutAndWipe();
    // Hard navigation, not a client route: every mounted screen is holding
    // state loaded under the session we just destroyed.
    window.location.replace("/login");
  }

  return (
    <button
      type="button"
      onClick={() => void handleSignOut()}
      disabled={busy}
      className="w-full rounded-2xl border border-line bg-white px-3 py-3 text-start font-medium text-ink-soft active:bg-paper-deep disabled:opacity-60"
    >
      <span className="flex items-center gap-3">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-paper-deep text-lg"
          aria-hidden="true"
        >
          🚪
        </span>
        <span className="flex-1">
          {busy ? strings.auth.signingOut : strings.auth.signOut}
        </span>
      </span>
    </button>
  );
}
