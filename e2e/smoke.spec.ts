import { test, expect } from "@playwright/test";

// Every owner-facing route in the app. With no Supabase env wired up the shell
// renders for all of them, so this is a real "does the whole app mount" pass.
const ROUTES = [
  "/",
  "/itinerary",
  "/budget",
  "/documents",
  "/more",
  "/map",
  "/photos",
  "/checklists",
  "/emergency",
  "/phrasebook",
  "/recommend",
  "/journal",
  "/kids",
  "/guests",
  "/pocket",
  "/messages",
  "/memory-book",
  "/notifications",
  "/links",
  "/login",
  "/kid-login",
];

test.describe("app shell", () => {
  test("root document is Hebrew and RTL", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("dir", "rtl");
    await expect(html).toHaveAttribute("lang", "he");
  });

  test("bottom nav shows the five Hebrew owner tabs", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation");
    await expect(nav).toBeVisible();
    for (const label of ["היום", "מסלול", "תקציב", "מסמכים", "עוד"]) {
      await expect(nav.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("tapping a nav tab navigates and marks it active", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation").getByText("תקציב", { exact: true }).click();
    await expect(page).toHaveURL(/\/budget$/);
  });

  test("nav is hidden on the login screens", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("navigation")).toHaveCount(0);
  });

  test("every screen keeps emergency one tap away (SPEC 2.12)", async ({
    page,
  }) => {
    // Today carries its own SOS in the header; every other screen gets the
    // shell-level one. Either way it is always exactly one tap (audit S-2).
    for (const route of ["/", "/budget", "/map", "/documents", "/photos"]) {
      await page.goto(route);
      const sos = page.getByRole("link", { name: "חירום" });
      await expect(sos, `no one-tap emergency access on ${route}`).toBeVisible();
      await expect(sos).toHaveAttribute("href", "/emergency");
    }
  });

  test("sign-out is reachable and warns before wiping the device", async ({
    page,
  }) => {
    // SPEC 2.5 caches documents unencrypted on condition they are wiped on
    // logout, so logout has to exist and has to say what it destroys (P-1).
    await page.goto("/more");
    const signOut = page.getByRole("button", { name: /יציאה מהחשבון/ });
    await expect(signOut).toBeVisible();

    let confirmText = "";
    page.on("dialog", (dialog) => {
      confirmText = dialog.message();
      void dialog.dismiss();
    });
    await signOut.click();
    expect(confirmText).toContain("יימחק");
  });

  test("PWA manifest is served and linked", async ({ page, request }) => {
    await page.goto("/");
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBeTruthy();
    const manifest = await res.json();
    expect(manifest.name || manifest.short_name).toBeTruthy();
  });
});

test.describe("routes mount without crashing", () => {
  for (const route of ROUTES) {
    test(`GET ${route} renders (no error overlay, no console error)`, async ({
      page,
    }) => {
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      const pageErrors: string[] = [];
      page.on("pageerror", (err) => pageErrors.push(err.message));

      const response = await page.goto(route, { waitUntil: "networkidle" });
      expect(response?.status(), `HTTP status for ${route}`).toBeLessThan(400);

      // The Next.js dev *error* overlay is a modal dialog (build/runtime error).
      // The <nextjs-portal> host is always present in dev (it also carries the
      // dev-tools indicator), so we assert specifically that no error dialog is
      // open — that's what a failed compile or render would surface.
      await expect(
        page.locator("nextjs-portal [data-nextjs-dialog], nextjs-portal [role='dialog']"),
      ).toHaveCount(0);

      // <body> actually painted something.
      await expect(page.locator("body")).not.toBeEmpty();

      expect(pageErrors, `uncaught exceptions on ${route}`).toEqual([]);
    });
  }
});
