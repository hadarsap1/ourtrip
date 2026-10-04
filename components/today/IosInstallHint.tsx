"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { BellIcon, CloseIcon } from "@/components/icons";
import { isIos, isStandalone } from "@/lib/push";
import { strings } from "@/lib/strings";

const DISMISS_KEY = "ourtrip-ios-hint-dismissed";
const noop = () => () => {};

function shouldShow(): boolean {
  try {
    if (localStorage.getItem(DISMISS_KEY)) return false;
  } catch {
    // storage blocked - still worth showing
  }
  return isIos() && !isStandalone();
}

/**
 * 1.11: on iPhone/iPad, Web Push only works once the app is on the home
 * screen. Without this card nobody finds out until a notification never
 * arrives. Links to the existing step-by-step on the notifications screen.
 */
export function IosInstallHint() {
  const visible = useSyncExternalStore(noop, shouldShow, () => false);
  const [dismissed, setDismissed] = useState(false);
  if (!visible || dismissed) return null;
  const t = strings.todayV2;
  return (
    <div className="flex items-center gap-3 rounded-[18px] border border-info/30 bg-info-soft px-3.5 py-2.5">
      <BellIcon className="h-5 w-5 shrink-0 text-info" />
      <Link href="/notifications" className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-ink">{t.iosHintTitle}</span>
        <span className="block text-[12px] text-ink-soft">{t.iosHintBody}</span>
      </Link>
      <button
        type="button"
        aria-label={strings.ui.close}
        onClick={() => {
          try {
            localStorage.setItem(DISMISS_KEY, "1");
          } catch {
            // non-essential
          }
          setDismissed(true);
        }}
        className="flex shrink-0 items-center justify-center rounded-full text-ink-soft"
      >
        <CloseIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
