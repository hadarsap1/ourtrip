import { test, expect, type Page } from "@playwright/test";
import { installMockSupabase } from "./support/mockSupabase";

// Screens with a trip in them. Two moments matter and they render different
// screens: five weeks before departure (countdown home) and day 3 of the trip
// (the live dashboard), standing in northern Vietnam.
const BEFORE = "2026-09-24T09:00:00+03:00";
const DAY_3 = "2026-11-02T09:00:00+07:00";

const ROUTES = [
  "/", "/itinerary", "/budget", "/documents", "/more", "/map", "/photos",
  "/checklists", "/emergency", "/phrasebook", "/recommend", "/journal", "/kids",
  "/guests", "/pocket", "/messages", "/memory-book", "/notifications",
  "/options", "/ready", "/facts", "/visas",
];

async function open(page: Page, route: string, at: string) {
  await page.clock.install({ time: new Date(at) });
  await installMockSupabase(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(route, { waitUntil: "networkidle" });
  // past AuthGate's optimistic timeout, so a stuck gate would show
  await page.clock.runFor(3000);
  return errors;
}

for (const [moment, at] of [["before the trip", BEFORE], ["day 3", DAY_3]] as const) {
  test.describe(`with data, ${moment}`, () => {
    for (const route of ROUTES) {
      test(`${route} renders with one h1 and no sideways scroll`, async ({ page }) => {
        const errors = await open(page, route, at);
        await expect(page.locator("h1")).toHaveCount(1);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        expect(overflow).toBeLessThanOrEqual(0);
        expect(errors).toEqual([]);
      });
    }
  });
}

test.describe("regressions found in the September QA pass", () => {
  test("budget: bookings paid in advance do not inflate the daily pace", async ({ page }) => {
    // Day 3 with ₪13,500 of prepaid flights and hotels, three of them dated
    // inside the trip. The projection used to read close to a million.
    await open(page, "/budget", DAY_3);
    const projection = page.getByText("צפי לסוף הטיול").locator("span");
    await expect(projection).toBeVisible();
    const value = Number((await projection.innerText()).replace(/[^\d.]/g, ""));
    expect(value).toBeGreaterThan(13_000);
    expect(value).toBeLessThan(40_000);
  });

  test("phrasebook opens on the language of today's country", async ({ page }) => {
    await open(page, "/phrasebook", DAY_3);
    await expect(
      page.getByRole("button", { name: "וייטנאמית", exact: true, pressed: true })
    ).toBeVisible();
    await expect(page.getByText("Xin chào")).toBeVisible();
    // an echoed transliteration is not printed under its own phrase
    await expect(page.getByText("Chào buổi sáng")).toBeVisible();
    await expect(page.getByText("בוקר טוב", { exact: true })).toHaveCount(1);
  });

  test("emergency page names the country its numbers are for", async ({ page }) => {
    await open(page, "/emergency", DAY_3);
    await expect(page.getByRole("heading", { name: /מספרי חירום - וייטנאם/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "וייטנאם", pressed: true })).toBeInViewport();
  });

  test("today names the country, not its ISO code", async ({ page }) => {
    await open(page, "/", DAY_3);
    await expect(page.locator("h1")).not.toContainText("VN");
  });

  test("a truncated Latin name keeps its beginning in RTL", async ({ page }) => {
    await open(page, "/", DAY_3);
    const hotel = page.locator(".truncate", { hasText: "Old Quarter" }).first();
    await expect(hotel).toHaveCSS("unicode-bidi", "plaintext");
  });
});
