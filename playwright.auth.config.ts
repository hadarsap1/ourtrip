import { defineConfig, devices } from "@playwright/test";

// Authenticated E2E config. Unlike the smoke config, this boots the app WITH a
// Supabase environment (taken from the E2E_* vars) so AuthGate performs a real
// session check, and runs only e2e/authenticated.spec.ts. The suite skips
// itself when the credentials are absent. See e2e/README.md.
const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /authenticated\.spec\.ts/,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    locale: "he-IL",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "authenticated-390",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 390, height: 844 },
        launchOptions: { executablePath: CHROMIUM },
      },
    },
  ],
  // Wire the app to the same test Supabase project the tests log into, so the
  // client-side session the tests inject is validated against it.
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.E2E_SUPABASE_URL ?? "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.E2E_SUPABASE_ANON_KEY ?? "",
    },
  },
});
