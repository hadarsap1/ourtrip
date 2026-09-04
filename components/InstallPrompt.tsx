"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { DownloadIcon, ShareIcon } from "@/components/icons";
import {
  installSnapshot,
  promptInstall,
  serverInstallSnapshot,
  subscribeInstall,
} from "@/lib/install";
import { strings } from "@/lib/strings";

/** Add-to-home-screen card. Renders nothing once the app is installed, and
 *  nothing on a browser that offers no install path, so it never becomes
 *  permanent furniture on the screen. */
export function InstallPrompt() {
  const s = strings.install;
  const { canPrompt, installed, ios } = useSyncExternalStore(
    subscribeInstall,
    installSnapshot,
    serverInstallSnapshot,
  );
  const [busy, setBusy] = useState(false);

  const onInstall = useCallback(async () => {
    setBusy(true);
    try {
      await promptInstall();
    } finally {
      setBusy(false);
    }
  }, []);

  if (installed) return null;

  if (canPrompt) {
    return (
      <section className="ot-card flex items-center gap-3 p-3.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-sea-tint text-sea-deep">
          <DownloadIcon className="h-[18px] w-[18px]" strokeWidth={1.7} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-bold text-ink">
            {s.title}
          </span>
          <span className="block text-[11px] text-ink-soft">{s.body}</span>
        </span>
        <button
          type="button"
          onClick={onInstall}
          disabled={busy}
          className="shrink-0 rounded-full bg-sea px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
        >
          {busy ? s.working : s.button}
        </button>
      </section>
    );
  }

  if (ios) {
    return (
      <section className="ot-card p-3.5">
        <h2 className="mb-2 flex items-center gap-2 text-[13.5px] font-bold text-ink">
          <ShareIcon className="h-4 w-4 shrink-0 text-sea" strokeWidth={1.7} />
          {s.iosTitle}
        </h2>
        <ol className="space-y-1 text-[11.5px] text-ink-soft">
          {[s.iosStep1, s.iosStep2, s.iosStep3, s.iosStep4].map((step, i) => (
            <li key={step} className="flex gap-1.5">
              <span className="font-bold text-sea">{i + 1}.</span>
              {step}
            </li>
          ))}
        </ol>
      </section>
    );
  }

  return null;
}
