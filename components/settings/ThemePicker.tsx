"use client";

import { useSyncExternalStore } from "react";
import { isEnabled } from "@/lib/flags";
import { readThemePref, setThemePref, subscribeThemePref, type ThemePref } from "@/lib/theme";
import { strings } from "@/lib/strings";

const OPTIONS: { value: ThemePref; label: string }[] = [
  { value: "light", label: strings.theme.light },
  { value: "dark", label: strings.theme.dark },
  { value: "system", label: strings.theme.system },
];

const noopSubscribe = () => () => {};

/** Light / dark / system, saved on this device only. */
export function ThemePicker() {
  // Device-only state: the server renders "system" and the picker hidden.
  const pref = useSyncExternalStore<ThemePref>(subscribeThemePref, readThemePref, () => "system");
  const enabled = useSyncExternalStore(noopSubscribe, () => isEnabled("themeSwitch"), () => false);

  if (!enabled) return null;

  return (
    <section aria-labelledby="theme-h" className="ot-card p-4">
      <h2 id="theme-h" className="text-base font-bold text-ink">
        {strings.theme.title}
      </h2>
      <p className="mt-0.5 text-xs text-ink-soft">{strings.theme.hint}</p>
      <div role="radiogroup" aria-labelledby="theme-h" className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-paper-deep p-1">
        {OPTIONS.map((o) => {
          const on = o.value === pref;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setThemePref(o.value)}
              className={`min-h-[44px] rounded-[10px] text-sm font-bold transition-colors ${
                on ? "bg-surface text-ink shadow-sm" : "text-ink-soft"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
