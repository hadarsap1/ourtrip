"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Toast } from "@/components/Toast";
import {
  currentPushState,
  disablePush,
  enablePush,
  isIos,
  isStandalone,
  type PushState,
} from "@/lib/push";
import { strings } from "@/lib/strings";

export function NotificationsScreen() {
  const s = strings.notifications;
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    void currentPushState().then(setState);
  }, []);

  // iOS before install: Web Push is unavailable until added to the home screen.
  const iosNeedsInstall = isIos() && !isStandalone();

  const onEnable = useCallback(async () => {
    setBusy(true);
    try {
      const next = await enablePush();
      setState(next);
      if (next === "denied") showToast(s.denied);
    } catch (err) {
      showToast((err as Error).message === "missing_vapid_key" ? s.missingKey : s.error);
    } finally {
      setBusy(false);
    }
  }, [s, showToast]);

  const onDisable = useCallback(async () => {
    setBusy(true);
    try {
      await disablePush();
      setState("default");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 pt-8 pb-8">
      <header>
        <h1 className="text-2xl font-bold">{s.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{s.subtitle}</p>
      </header>

      {/* what we send */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">{s.whatTitle}</h2>
        <ul className="space-y-1.5 text-sm text-slate-600">
          <li>{s.whatWeather}</li>
          <li>{s.whatCheckin}</li>
          <li>{s.whatWall}</li>
          <li>{s.whatPhoto}</li>
        </ul>
      </section>

      {/* control — iOS-before-install always shows the install steps first,
          since Web Push can't work until the PWA is on the home screen */}
      {iosNeedsInstall ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="mb-3 font-semibold text-amber-800">{s.iosTitle}</h2>
          <ol className="space-y-2 text-sm text-amber-900">
            <li className="flex gap-2"><span className="font-bold">1.</span>{s.iosStep1}</li>
            <li className="flex gap-2"><span className="font-bold">2.</span>{s.iosStep2}</li>
            <li className="flex gap-2"><span className="font-bold">3.</span>{s.iosStep3}</li>
            <li className="flex gap-2"><span className="font-bold">4.</span>{s.iosStep4}</li>
          </ol>
        </section>
      ) : state === "unsupported" ? (
        <p className="rounded-2xl bg-slate-100 p-4 text-center text-sm text-slate-500">
          {s.unsupported}
        </p>
      ) : state === "denied" ? (
        <p className="rounded-2xl bg-rose-50 p-4 text-center text-sm text-rose-600">
          {s.denied}
        </p>
      ) : state === "subscribed" ? (
        <div className="space-y-3">
          <p className="rounded-2xl bg-teal-50 p-4 text-center text-sm font-medium text-teal-700">
            {s.enabled}
          </p>
          <button
            type="button"
            onClick={onDisable}
            disabled={busy}
            className="w-full rounded-2xl border border-slate-200 bg-white py-3 font-medium text-slate-600 disabled:opacity-50"
          >
            {s.disable}
          </button>
        </div>
      ) : state === "default" ? (
        <button
          type="button"
          onClick={onEnable}
          disabled={busy}
          className="w-full rounded-2xl bg-teal-600 py-3.5 font-semibold text-white shadow-sm disabled:opacity-50"
        >
          {busy ? s.working : s.enable}
        </button>
      ) : null}

      <Toast message={toast} />
    </div>
  );
}
