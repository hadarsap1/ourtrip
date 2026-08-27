"use client";

import { useEffect } from "react";

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
  useEffect(() => {
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
      if (idle === null) return;
      if (typeof idleCallback === "function") window.cancelIdleCallback(idle);
      else clearTimeout(idle);
    };
  }, []);

  return null;
}
