// Captures the manifest screenshots that Chrome shows in its install dialog.
// Without them Android falls back to the plain mini-infobar instead of the
// full "install app" sheet.
//
// These are real renders of the running app, not mockups. Run against a server
// with NO Supabase env and AuthGate bypasses (see components/AuthGate.tsx), so
// every screen renders its empty state; run it against a dev server that has
// `.env.local` wired up and a signed-in session to capture screens with real
// trip data instead. Either way:
//
//   npm run build && npm run start &
//   node scripts/generate-screenshots.mjs
//
// Sizes must keep matching public/manifest.webmanifest, or Chrome drops the
// screenshot silently.

import { chromium, devices } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "public/screenshots");
const BASE = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";

// The device pixel ratio is pinned rather than inherited from the emulated
// phone: Chrome compares the manifest's `sizes` against the real pixel
// dimensions of the file and silently ignores any screenshot that disagrees.
// Pixel 5 emulation would have produced 1073x2321 files behind a "390x844"
// declaration, i.e. no screenshots at all in the install dialog.
const NARROW = { width: 390, height: 844, dpr: 2 }; // CLAUDE.md rule #5 viewport
const WIDE = { width: 1280, height: 800, dpr: 1 }; // 2x would exceed Chrome's 3840px cap

const SHOTS = [
  { path: "/", file: "today-narrow.png", viewport: NARROW },
  { path: "/itinerary", file: "itinerary-narrow.png", viewport: NARROW },
  { path: "/budget", file: "budget-narrow.png", viewport: NARROW },
  { path: "/documents", file: "documents-narrow.png", viewport: NARROW },
  { path: "/", file: "today-wide.png", viewport: WIDE },
];

/** Real pixel dimensions, straight out of the PNG header, so the log can be
 *  pasted into the manifest without trusting the viewport maths. */
function pngSize(buffer) {
  return `${buffer.readUInt32BE(16)}x${buffer.readUInt32BE(20)}`;
}

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
for (const shot of SHOTS) {
  // A fresh context per shot: deviceScaleFactor is fixed at context creation.
  const context = await browser.newContext({
    ...devices["Pixel 5"],
    viewport: { width: shot.viewport.width, height: shot.viewport.height },
    deviceScaleFactor: shot.viewport.dpr,
    locale: "he-IL",
    isMobile: false, // the wide shot needs a desktop-ish context
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle" });
  // Let the Hebrew webfont and any client-side load settle before the shot.
  await page.waitForTimeout(1200);
  const png = await page.screenshot({ path: resolve(OUT, shot.file) });
  console.log(`${shot.file}  ${pngSize(png)}`);
  await context.close();
}

await browser.close();
