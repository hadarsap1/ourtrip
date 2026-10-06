"use client";

import { useSyncExternalStore } from "react";
import { isEnabled, setFlagOverride, type FlagKey } from "@/lib/flags";
import { strings } from "@/lib/strings";
import { useMember } from "@/lib/useMember";

const noop = () => () => {};
const t = strings.featureTest;
const KEYS = Object.keys(t.names) as (keyof typeof t.names & FlagKey)[];

/**
 * Phase 2 testing on a phone, parents only. A Home Screen app on iOS keeps its
 * own storage, separate from Safari, so `?test=` in Safari never reached it;
 * this switches a flag for THIS device from inside the app. UI only - what a
 * role can read is still decided by RLS.
 */
export function FeatureTestToggles() {
  const { member } = useMember();
  const states = useSyncExternalStore(
    noop,
    () => KEYS.map((k) => (isEnabled(k) ? "1" : "0")).join(""),
    () => ""
  );
  if (member?.role !== "owner" || !states) return null;

  function flip(key: FlagKey, value: boolean) {
    setFlagOverride(key, value);
    // Screens read flags once; reload so every screen picks up the change.
    window.location.reload();
  }

  function reset() {
    for (const k of KEYS) setFlagOverride(k, null);
    window.location.reload();
  }

  return (
    <details className="rounded-[18px] border border-line bg-surface px-3.5 py-1">
      <summary className="flex min-h-[44px] cursor-pointer items-center text-sm font-bold text-ink">{t.title}</summary>
      <p className="pb-2 text-[12px] text-ink-soft">{t.hint}</p>
      <ul className="divide-y divide-line">
        {KEYS.map((key, i) => {
          const on = states[i] === "1";
          return (
            <li key={key} className="flex min-h-[48px] items-center justify-between gap-3">
              <span className="text-sm text-ink">{t.names[key]}</span>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={t.names[key]}
                onClick={() => flip(key, !on)}
                className="flex h-11 w-14 shrink-0 items-center justify-center"
              >
                {/* the button is the 44px tap target; the track is the visual */}
                <span className={`relative block h-7 w-12 rounded-full transition-colors ${on ? "bg-sea" : "bg-line"}`}>
                  <span className={`absolute top-1 block h-5 w-5 rounded-full bg-surface shadow transition-all ${on ? "start-6" : "start-1"}`} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={reset} className="my-2 min-h-[44px] w-full rounded-xl border border-line text-sm font-bold text-ink-soft">
        {t.reset}
      </button>
    </details>
  );
}
