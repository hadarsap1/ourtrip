import { defineConfig, devices } from "@playwright/test";
import { MOCK_ANON_KEY, MOCK_URL } from "./e2e/support/mockSupabase";

// Populated E2E: the real app, signed in as an owner, with a whole trip of
// data - and no credentials. The app is started against MOCK_URL, and every
// Supabase call the browser makes is answered in-process by
// e2e/support/mockSupabase.ts from the synthetic trip in e2e/support/fixtures.ts.
//
// The smoke suite proves every screen mounts empty; this one is where screens
// are looked at with content in them, on a phone and on a desktop. See
// e2e/README.md.
const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /populated\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "he-IL",
    trace: "on-first-retry",
    // A registered service worker would answer from its cache, not the mock.
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "populated-390",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 390, height: 844 },
        launchOptions: { executablePath: CHROMIUM },
      },
    },
    {
      name: "populated-1280",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        launchOptions: { executablePath: CHROMIUM },
      },
    },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: MOCK_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: MOCK_ANON_KEY,
    },
  },
});
