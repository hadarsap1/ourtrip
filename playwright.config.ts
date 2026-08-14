import { defineConfig, devices } from "@playwright/test";

// End-to-end smoke tests. These boot the real Next.js app with NO Supabase env
// wired up — in that mode AuthGate bypasses (see components/AuthGate.tsx) and the
// full Hebrew RTL shell renders, so we can verify every route mounts, the bottom
// nav works, and the offline/PWA plumbing is present without needing credentials
// or seeded data. Deeper data-driven flows are covered by the unit tests in lib/.
//
// The dev sandbox ships a pre-installed Chromium at /opt/pw-browsers, so point
// executablePath at it rather than downloading one. CI installs its own via
// `playwright install`, where the right answer is `undefined` — let Playwright
// resolve the browser it manages. Resolved by probing rather than hardcoding,
// so the same config works in both without an env var to remember.
import { existsSync } from "node:fs";

const SANDBOX_CHROMIUM =
  process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium";
const CHROMIUM = existsSync(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined;

export default defineConfig({
  testDir: "./e2e",
  // Authenticated flows have their own env-wired config (playwright.auth.config.ts).
  testIgnore: /authenticated\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    locale: "he-IL",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "mobile-390",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 390, height: 844 },
        launchOptions: { executablePath: CHROMIUM },
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
