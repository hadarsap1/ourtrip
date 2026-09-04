// OurTrip service worker.
//
// Caching rules, in priority order:
//   1. Never touch anything that isn't a same-origin GET — Supabase, Google
//      Maps and Open-Meteo must reach the network untouched.
//   2. Never cache React Server Component payloads (`?_rsc=`). They are tied
//      to one build; a stale one makes tab switches render old data or fail.
//   3. Hashed build assets live in their own cache that SURVIVES a service
//      worker update. Wiping them on activate used to pull the rug out from
//      under an open page (its next chunk 404s → white screen until refresh).
//   4. Navigations are network-first with a short timeout, so a slow mobile
//      connection falls back to the cached shell instead of hanging.

const SHELL_CACHE = "ourtrip-shell-v12";
const ASSET_CACHE = "ourtrip-assets-v1"; // content-hashed URLs — safe to keep
const CURRENT_CACHES = [SHELL_CACHE, ASSET_CACHE];

// Cap the asset cache so months on the road don't fill the device.
const ASSET_CACHE_LIMIT = 400;

// Navigation network timeout: past this we serve the cached shell and let the
// page hydrate from IndexedDB rather than leaving the family staring at white.
const NAV_TIMEOUT_MS = 4000;

const SHELL_URLS = [
  "/", "/itinerary", "/budget", "/documents", "/more", "/checklists",
  "/emergency", "/map", "/phrasebook", "/journal", "/photos", "/pocket",
  "/messages", "/recommend", "/notifications", "/options", "/memory-book",
  "/offline", "/manifest.webmanifest",
];

// Served for a navigation that is neither cached nor reachable. Serving "/"
// there instead would show the Today screen under someone else's URL, which
// reads as a bug; this page names the screens that do work offline.
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // Individually, not addAll: one failing URL used to abort the whole
      // install, leaving the app with no service worker at all.
      Promise.all(
        SHELL_URLS.map((url) =>
          fetch(url, { credentials: "same-origin" })
            .then((res) => (res.ok ? cache.put(url, res) : null))
            .catch(() => null)
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("ourtrip-") && !CURRENT_CACHES.includes(k))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => trimCache(ASSET_CACHE, ASSET_CACHE_LIMIT))
      .then(() => self.clients.claim())
  );
});

/** Drops the oldest entries once a cache grows past `limit`. */
async function trimCache(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys(); // insertion order
  if (keys.length <= limit) return;
  await Promise.all(keys.slice(0, keys.length - limit).map((k) => cache.delete(k)));
}

function isAsset(url) {
  if (url.pathname === "/sw.js") return false; // never cache ourselves
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:js|css|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)
  );
}

/** Cache-first: build assets are content-hashed, so a hit is always correct. */
async function assetFirst(request) {
  const cached = await caches.match(request, { cacheName: ASSET_CACHE });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const copy = response.clone();
    caches
      .open(ASSET_CACHE)
      .then((cache) => cache.put(request, copy))
      .catch(() => {});
  }
  return response;
}

/** Network-first with a timeout, falling back to the cached shell. */
async function navigateWithFallback(request) {
  const fallback = async () =>
    (await caches.match(request, { cacheName: SHELL_CACHE })) ??
    (await caches.match(OFFLINE_URL, { cacheName: SHELL_CACHE })) ??
    (await caches.match("/", { cacheName: SHELL_CACHE })) ??
    Response.error();

  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("nav-timeout")), NAV_TIMEOUT_MS);
    });
    const response = await Promise.race([fetch(request), timeout]);
    if (response.ok) {
      const copy = response.clone();
      caches
        .open(SHELL_CACHE)
        .then((cache) => cache.put(request, copy))
        .catch(() => {});
    }
    return response;
  } catch {
    return fallback();
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Rule 1: leave every other origin alone.
  if (url.origin !== self.location.origin) return;

  // Rule 2: RSC payloads and route prefetches are build-specific — always live.
  if (url.searchParams.has("_rsc") || request.headers.get("RSC") === "1") return;

  if (request.mode === "navigate") {
    event.respondWith(navigateWithFallback(request));
    return;
  }

  if (isAsset(url)) {
    event.respondWith(assetFirst(request).catch(() => fetch(request)));
    return;
  }

  // Anything else same-origin (manifest, small JSON): stale-while-revalidate.
  event.respondWith(
    caches.match(request, { cacheName: SHELL_CACHE }).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches
              .open(SHELL_CACHE)
              .then((cache) => cache.put(request, copy))
              .catch(() => {});
          }
          return response;
        })
        .catch(() => cached ?? Response.error());
      return cached ?? network;
    })
  );
});

// ---- Web Push (Sprint 8) ----
// Payload shape from the push-send Edge Function: { title, body, url, tag }.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "OurTrip", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "OurTrip";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    dir: "rtl",
    lang: "he",
    tag: data.tag || undefined,
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
