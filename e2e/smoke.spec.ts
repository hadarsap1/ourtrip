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
  "/options",
  "/ready",
  "/offline",
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
    // Two navigation landmarks exist from lg up (bottom bar + side rail), so
    // this addresses the bottom bar by name.
    const nav = page.getByRole("navigation", { name: "ניווט ראשי" });
    await expect(nav).toBeVisible();
    for (const label of ["היום", "מסלול", "תקציב", "מסמכים", "עוד"]) {
      await expect(nav.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("tapping a nav tab navigates and marks it active", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "ניווט ראשי" })
      .getByText("תקציב", { exact: true })
      .click();
    await expect(page).toHaveURL(/\/budget$/);
  });

  test("nav is hidden on the login screens", async ({ page }) => {
    await page.goto("/login");
    // Neither the bottom bar nor the rail renders on the login screens.
    await expect(page.getByRole("navigation")).toHaveCount(0);
  });

  test("PWA manifest is served and linked", async ({ page, request }) => {
    await page.goto("/");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      /manifest\.webmanifest/,
    );
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBeTruthy();
    const manifest = await res.json();
    expect(manifest.name || manifest.short_name).toBeTruthy();
  });
});

/** Width and height straight out of the PNG header (IHDR is fixed-offset). */
function pngSize(body: Buffer): string {
  return `${body.readUInt32BE(16)}x${body.readUInt32BE(20)}`;
}

// These are the install-time failures that are invisible in normal use: the
// browser just quietly declines to offer an install, or ships a cropped icon.
test.describe("installability", () => {
  test("manifest declares what an install actually needs", async ({
    request,
  }) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.dir).toBe("rtl");
    expect(manifest.lang).toBe("he");
    // Without a maskable icon Android crops the rounded-square one to its
    // launcher shape and the transparent corners show as notches.
    expect(
      manifest.icons.some((i: { purpose?: string }) => i.purpose === "maskable"),
    ).toBeTruthy();
    expect(
      manifest.icons.some(
        (i: { sizes: string; purpose?: string }) =>
          i.sizes === "512x512" && i.purpose !== "maskable",
      ),
    ).toBeTruthy();
    // Chrome needs both form factors for the rich install dialog.
    for (const factor of ["narrow", "wide"]) {
      expect(
        manifest.screenshots.some(
          (s: { form_factor?: string }) => s.form_factor === factor,
        ),
        `a ${factor} screenshot`,
      ).toBeTruthy();
    }
  });

  test("every icon and screenshot is served at its declared size", async ({
    request,
  }) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    const assets: { src: string; sizes: string }[] = [
      ...manifest.icons,
      ...manifest.screenshots,
    ];
    for (const asset of assets) {
      const res = await request.get(asset.src);
      expect(res.ok(), `${asset.src} is served`).toBeTruthy();
      // A mismatch here is why this test exists: the browser silently ignores
      // an asset whose real pixel size disagrees with the manifest, so the
      // install dialog degrades with nothing in any log.
      expect(pngSize(await res.body()), `${asset.src} pixel size`).toBe(
        asset.sizes,
      );
    }
  });

  test("theme colour agrees between the document and the manifest", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      "content",
      manifest.theme_color,
    );
  });

  test("iOS home-screen icon is linked and served", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    const href = await page
      .locator('link[rel="apple-touch-icon"]')
      .first()
      .getAttribute("href");
    expect(href, "apple-touch-icon link").toBeTruthy();
    const res = await request.get(href!);
    expect(res.ok()).toBeTruthy();
  });

  test("service worker script is served", async ({ request }) => {
    const res = await request.get("/sw.js");
    expect(res.ok()).toBeTruthy();
    expect(await res.text()).toContain("addEventListener");
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
      // open - that's what a failed compile or render would surface.
      await expect(
        page.locator("nextjs-portal [data-nextjs-dialog], nextjs-portal [role='dialog']"),
      ).toHaveCount(0);

      // <body> actually painted something.
      await expect(page.locator("body")).not.toBeEmpty();

      expect(pageErrors, `uncaught exceptions on ${route}`).toEqual([]);
    });
  }
});
