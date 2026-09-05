import { test, expect } from "@playwright/test";
import { authEnv, authReady, signInSession, storageKey } from "./support/auth";

// Authenticated owner flows. These run only when the E2E_* env vars are set
// (see e2e/support/auth.ts and e2e/README.md) and drive the app the way a
// logged-in owner would - proving AuthGate + RLS let a real member through,
// which the credential-free smoke suite deliberately cannot cover.
//
// Run with:  npm run test:e2e:auth
test.describe("authenticated owner", () => {
  test.skip(
    !authReady,
    "Set E2E_SUPABASE_URL / E2E_SUPABASE_ANON_KEY / E2E_TEST_EMAIL / E2E_TEST_PASSWORD to run",
  );

  // Seed a real session into localStorage before the app's first paint so
  // AuthGate.getSession() finds it and does not redirect to /login.
  test.beforeEach(async ({ page }) => {
    const session = await signInSession();
    const key = storageKey(authEnv.url!);
    await page.addInitScript(
      ({ key, value }) => window.localStorage.setItem(key, value),
      // supabase-js v2 stores the session object directly. If a future version
      // wraps it, change this to { currentSession: session } here and in the app.
      { key, value: JSON.stringify(session) },
    );
  });

  test("owner reaches the app instead of the login screen", async ({ page }) => {
    await page.goto("/");
    await expect(page).not.toHaveURL(/\/login$/);
    await expect(page.getByRole("navigation")).toBeVisible();
  });

  test("owner can open budget and documents (kid/guest-gated screens)", async ({
    page,
  }) => {
    await page.goto("/budget");
    await expect(page).not.toHaveURL(/\/login$/);
    await expect(page.getByRole("navigation")).toBeVisible();

    await page.goto("/documents");
    await expect(page).not.toHaveURL(/\/login$/);
    await expect(page.getByRole("navigation")).toBeVisible();
  });
});
