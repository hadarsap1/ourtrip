"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { currentPushState, enablePush, type PushState } from "@/lib/push";
import { strings } from "@/lib/strings";

// per device: "not now". The card comes back only if the storage is cleared.
const DISMISS_KEY = "ot.friendPushInviteDismissed";

const noop = () => () => {};
function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/** A kid or a friend: turn on push for this tablet, so a new chat message
 *  shows on the screen and nobody spends screen time opening the app only to
 *  check (00112). On = a push_subscriptions row (self-scoped RLS, 00010).
 *  Shown only while it can be turned on right here. */
export function ChatPushInvite() {
  const f = strings.friends;
  const stored = useSyncExternalStore(noop, readDismissed, () => true);
  const [dismissedNow, setDismissedNow] = useState(false);
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void currentPushState().then(setState).catch(() => setState("unsupported"));
  }, []);

  const turnOn = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await enablePush();
      setState(next);
      if (next === "denied") setError(f.pushDenied);
    } catch {
      setError(f.pushFailed);
    } finally {
      setBusy(false);
    }
  }, [f]);

  if (stored || dismissedNow) return null;
  // denied stays up with its explanation; on or impossible: nothing to ask
  if (state !== "default" && !(state === "denied" && error)) return null;

  return (
    <section className="rounded-card border border-line bg-surface px-4 py-3 shadow-card">
      <p className="text-base font-bold text-ink">{f.pushTitle}</p>
      <p className="mt-0.5 text-sm text-ink-soft">{f.pushBody}</p>
      {state === "default" && (
        <div className="mt-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void turnOn()}
            disabled={busy}
            className="min-h-11 rounded-full bg-sea px-4 text-sm font-bold text-on-sea disabled:opacity-50"
          >
            {busy ? f.pushWorking : f.pushEnable}
          </button>
          <button
            type="button"
            onClick={() => {
              setDismissedNow(true);
              try {
                window.localStorage.setItem(DISMISS_KEY, "1");
              } catch {
                // shows again next visit
              }
            }}
            className="min-h-11 rounded-full px-3 text-sm font-semibold text-ink-soft"
          >
            {f.pushLater}
          </button>
        </div>
      )}
      {error && (
        <p className="mt-2 text-sm text-alert" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
