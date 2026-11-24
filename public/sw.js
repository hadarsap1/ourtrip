// OurTrip service worker.
//
// Caching rules, in priority order:
//   0. Photos from Supabase Storage are kept by their storage path (egress
//      fix 24/11/2026). Each signed URL carries a new token, so the browser
//      saw every photo as new and downloaded it again: 5,063 downloads of
//      225 photos in one day, all past the free plan's bandwidth. Storage
//      paths are random UUIDs that are never overwritten, so one path is
//      always the same bytes and a cached copy never goes stale. Only a page
//      that already holds a valid signed URL for a path asks for it, so this
//      grants no one a photo RLS did not sign for them (hard rule 3 holds).
//      Pictures only: video (Range requests) and documents go to the network.
//   1. Never touch anything else that isn't a same-origin GET - Supabase,
//      Google Maps and Open-Meteo must reach the network untouched.
//   2. Never cache React Server Component payloads (`?_rsc=`). They are tied
//      to one build; a stale one makes tab switches render old data or fail.
//   3. Hashed build assets live in their own cache that SURVIVES a service
//      worker update. Wiping them on activate used to pull the rug out from
//      under an open page (its next chunk 404s → white screen until refresh).
//   4. Navigations are network-first with a short timeout, so a slow mobile
//      connection falls back to the cached shell instead of hanging.

const SHELL_CACHE = "ourtrip-shell-v21";
const ASSET_CACHE = "ourtrip-assets-v1"; // content-hashed URLs - safe to keep
// Photos by storage path (rule 0). Same name as MEDIA_CACHE in
// lib/supabase.ts, which deletes it on sign-out.
const MEDIA_CACHE = "ourtrip-media-v1";
const CURRENT_CACHES = [SHELL_CACHE, ASSET_CACHE, MEDIA_CACHE];

// Cap the asset cache so months on the road don't fill the device.
const ASSET_CACHE_LIMIT = 400;
// ~1,500 pictures: full photos are ~350KB, thumbnails far less
const MEDIA_CACHE_LIMIT = 1500;

// Signed Storage reads of the picture buckets: /storage/v1/object/sign/<bucket>/<path>
const MEDIA_PATH = /^\/storage\/v1\/object\/sign\/(?:photos|map-photos|gphotos)\//;

// Navigation network timeout: past this we serve the cached shell and let the
// page hydrate from IndexedDB rather than leaving the family staring at white.
const NAV_TIMEOUT_MS = 4000;

const SHELL_URLS = [
  "/", "/itinerary", "/budget", "/documents", "/more", "/checklists",
  "/emergency", "/map", "/phrasebook", "/photos", "/pocket",
  "/messages", "/recommend", "/notifications", "/options", "/memory-book",
  "/ready", "/facts", "/settings", "/stories", "/podcast", "/offline",
  // added after the list was last revised: without its page a screen opened
  // offline for the first time fell to /offline (QA 15/11/2026)
  "/jar", "/stats", "/visas",
  "/manifest.webmanifest",
];

// Served for a navigation that is neither cached nor reachable. Serving "/"
// there instead would show the Today screen under someone else's URL, which
// reads as a bug; this page names the screens that do work offline.
const OFFLINE_URL = "/offline";

// Build files (CSS, JS chunks) a cached page refers to. Caching the page
// alone was not enough (found in QA): the page that installs the worker loads
// its CSS/JS before the worker controls it, and screens not opened since the
// last deploy never fetched theirs - offline they opened unstyled and inert.
const STATIC_REF = /\/_next\/static\/[^"'\s)\\]+?\.(?:css|js)/g;

async function precacheShell() {
  const shell = await caches.open(SHELL_CACHE);
  const refs = new Set();
  // Individually, not addAll: one failing URL used to abort the whole
  // install, leaving the app with no service worker at all.
  await Promise.all(
    SHELL_URLS.map(async (url) => {
      try {
        const res = await fetch(url, { credentials: "same-origin" });
        if (!res.ok) return;
        if ((res.headers.get("content-type") ?? "").includes("text/html")) {
          for (const ref of (await res.clone().text()).match(STATIC_REF) ?? []) refs.add(ref);
        }
        await shell.put(url, res);
      } catch {
        // offline during install: the next visit caches it
      }
    })
  );
  const assets = await caches.open(ASSET_CACHE);
  await Promise.all(
    [...refs].map(async (ref) => {
      try {
        const res = await fetch(ref);
        if (!res.ok) return;
        // delete + put moves it to the end, so trimCache keeps this build's files
        await assets.delete(ref);
        await assets.put(ref, res);
      } catch {
        // missing now; cached on first use instead
      }
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell());
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

function isMedia(url, request) {
  return (
    url.hostname.endsWith(".supabase.co") &&
    MEDIA_PATH.test(url.pathname) &&
    !request.headers.has("range")
  );
}

/** Cache-first by storage path (rule 0): the token is left out of the key. */
async function mediaFirst(request, url) {
  const key = url.origin + url.pathname;
  const cache = await caches.open(MEDIA_CACHE);
  const cached = await cache.match(key);
  if (cached) return cached;
  // CORS, not the <img>'s no-cors: an opaque response can't be checked and
  // is counted as megabytes of quota each
  const response = await fetch(url.href, { mode: "cors", credentials: "omit" });
  const type = response.headers.get("content-type") ?? "";
  if (response.status === 200 && type.startsWith("image/")) {
    const copy = response.clone();
    cache
      .put(key, copy)
      .then(() => trimCache(MEDIA_CACHE, MEDIA_CACHE_LIMIT))
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
    // One-off public pages (a story, a join link) are not kept: each has its
    // own address, so the shell cache grew with every one ever opened.
    const path = new URL(request.url).pathname;
    const oneOff = path.startsWith("/s/") || path.startsWith("/join/") || path.startsWith("/j/");
    if (response.ok && !oneOff) {
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

  // Rule 0: a photo already on the device is not downloaded again.
  if (isMedia(url, request)) {
    event.respondWith(mediaFirst(request, url).catch(() => fetch(request)));
    return;
  }

  // Rule 1: leave every other origin alone.
  if (url.origin !== self.location.origin) return;

  // Rule 2: RSC payloads and route prefetches are build-specific - always live.
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
// Payload shape from the push-send Edge Function:
//   { title, body, url, tag, many, count, silent, badge, manyUrl }.
//
// Repeats of one kind (wall messages, approvals waiting, comments and likes)
// fold into a single notification instead of piling up: when a push carries
// `many` and one with its tag is still showing, that one is replaced by a
// notification titled with the running count ("{n} הודעות חדשות בקיר") and the
// latest preview, and the update is silent - only the first one rings. The app
// lists them all. `count` is how many items one push stands for (default 1).
//
// `silent` never rings at all (comments and likes, 00104). `badge` counts
// toward the number on the app icon (Badging API - iPhone/iPad home-screen app
// and desktop; Android shows its own dot from the notification). The app
// clears both when it is opened (components/RegisterSW.tsx).
async function badgeCount() {
  const showing = await self.registration.getNotifications().catch(() => []);
  return showing.reduce(
    (n, shown) => n + (shown.data && shown.data.badge ? shown.data.count || 1 : 0),
    0
  );
}

async function refreshBadge() {
  if (!("setAppBadge" in self.navigator)) return;
  const n = await badgeCount();
  try {
    if (n > 0) await self.navigator.setAppBadge(n);
    else await self.navigator.clearAppBadge();
  } catch {
    // not allowed on this platform - the notification itself still shows
  }
}

async function showPush(data) {
  const title = data.title || "סו-בב עולם!";
  const count = Number(data.count) > 0 ? Number(data.count) : 1;
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    dir: "rtl",
    lang: "he",
    tag: data.tag || undefined,
    silent: data.silent === true,
    data: { url: data.url || "/", count, badge: data.badge === true },
  };
  if (data.tag && data.many) {
    const showing = await self.registration.getNotifications({ tag: data.tag }).catch(() => []);
    const before = showing.reduce((n, shown) => n + ((shown.data && shown.data.count) || 1), 0);
    if (before > 0) {
      // closed first: not every platform replaces by tag on its own
      for (const shown of showing) shown.close();
      options.data.count = before + count;
      options.data.url = data.manyUrl || options.data.url;
      options.silent = true;
      await self.registration.showNotification(data.many.replace("{n}", String(before + count)), options);
      return refreshBadge();
    }
  }
  await self.registration.showNotification(title, options);
  return refreshBadge();
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "סו-בב עולם!", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(showPush(data));
});

self.addEventListener("notificationclose", (event) => {
  event.waitUntil(refreshBadge());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  // the window first: openWindow must run while the tap still counts
  const open = self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    for (const client of clients) {
      if ("focus" in client) {
        client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  });
  event.waitUntil(Promise.all([open, refreshBadge()]));
});
