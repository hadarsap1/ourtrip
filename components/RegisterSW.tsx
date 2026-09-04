"use client";

import { useEffect, useState } from "react";
import { startInstallCapture } from "@/lib/install";
import { strings } from "@/lib/strings";

// A stale chunk reference is the classic PWA white screen: the page was loaded
// from one build, a new one shipped, and the next lazily-loaded chunk 404s.
// React unmounts the tree and the family sees nothing until they refresh by
// hand. Detect it and refresh for them — once, so a genuinely broken build
// can't put the app in a reload loop.
const CHUNK_ERROR =
  /ChunkLoadError|Loading chunk \S+ failed|dynamically imported module|Importing a module script failed/i;
const RELOAD_GUARD_KEY = "ourtrip-chunk-reload-at";
const RELOAD_GUARD_MS = 30_000;

function recoverFromStaleBuild(): void {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0);
  } catch {
    // sessionStorage unavailable (private mode) — one reload is still better
    // than a permanent white screen.
  }
  if (Date.now() - last < RELOAD_GUARD_MS) return;
  try {
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    // best-effort
  }
  window.location.reload();
}

export function RegisterSW() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    // `beforeinstallprompt` fires once, seconds after load, and only the app
    // shell is guaranteed to be mounted then — so capture starts here rather
    // than in the card on /more, which would usually miss it.
    startInstallCapture();

    const onError = (event: ErrorEvent) => {
      if (CHUNK_ERROR.test(event.message ?? "")) recoverFromStaleBuild();
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        typeof reason === "string" ? reason : (reason?.message ?? "");
      if (CHUNK_ERROR.test(message)) recoverFromStaleBuild();
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    // A new service worker calls skipWaiting(), so it activates and claims this
    // page immediately — but the JS already running here is still the old
    // build. Reloading unasked would drop half-typed forms, so say so and let
    // whoever is holding the phone pick the moment. `hadController` keeps the
    // very first install (claim with no previous controller) from announcing
    // an "update" on someone's first visit.
    const hasSW = "serviceWorker" in navigator;
    const hadController = hasSW && navigator.serviceWorker.controller !== null;
    const onControllerChange = () => {
      if (hadController) setUpdateReady(true);
    };
    if (hasSW) {
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        onControllerChange,
      );
    }

    // Registering during the first paint competes with the screen's own data
    // fetches for a phone's limited connection — wait for idle.
    let idle: number | null = null;
    const register = () => {
      if (!("serviceWorker" in navigator)) return;
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failure is non-fatal; the app still works online.
      });
    };
    // Older Safari has no requestIdleCallback despite the DOM typings.
    const idleCallback: typeof window.requestIdleCallback | undefined =
      window.requestIdleCallback;
    idle =
      typeof idleCallback === "function"
        ? idleCallback(register, { timeout: 3000 })
        : window.setTimeout(register, 1500);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      if (hasSW) {
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          onControllerChange,
        );
      }
      if (idle === null) return;
      if (typeof idleCallback === "function") window.cancelIdleCallback(idle);
      else clearTimeout(idle);
    };
  }, []);

  if (!updateReady) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-20 z-[70] flex items-center gap-3 rounded-xl bg-ink/95 px-4 py-3 text-white shadow-lg lg:bottom-4 lg:end-4 lg:inset-x-auto lg:max-w-sm"
    >
      <span className="flex-1 text-sm font-medium">{strings.update.ready}</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 rounded-full bg-white px-3.5 py-1.5 text-[13px] font-bold text-ink"
      >
        {strings.update.action}
      </button>
      <button
        type="button"
        onClick={() => setUpdateReady(false)}
        className="shrink-0 text-[13px] font-medium text-white/70"
      >
        {strings.update.dismiss}
      </button>
    </div>
  );
}
