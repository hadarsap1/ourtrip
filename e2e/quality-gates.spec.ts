import { test, expect, type Page } from "@playwright/test";

// Phase 0 acceptance gate (docs/upgrade/PLAN.md, F2 + F3):
//  - every visible interactive element is at least 44×44 CSS px
//  - no visible text is smaller than 12px
// on the top 8 routes, at 390×844 and 360×800, light and dark.
// Runs against the no-backend shell (AuthGate bypass), so it covers chrome,
// empty states and forms - the data-driven rows are covered when the same
// spec runs under playwright.auth.config.ts.

const ROUTES = ["/", "/itinerary", "/budget", "/documents", "/more", "/emergency", "/phrasebook", "/journal"];
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 360, height: 800 },
];
const MIN_TAP = 44;
const MIN_TEXT = 12;

type Offender = { what: string; size: string; route: string };

async function audit(page: Page, route: string): Promise<{ taps: Offender[]; texts: Offender[] }> {
  return page.evaluate(
    ({ MIN_TAP, MIN_TEXT, route }) => {
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const cs = getComputedStyle(el);
        return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0;
      };
      const label = (el: Element) =>
        `${el.tagName.toLowerCase()}${el.getAttribute("aria-label") ? `[${el.getAttribute("aria-label")}]` : ""} "${(el.textContent ?? "").trim().slice(0, 30)}"`;

      const taps: Offender[] = [];
      const sel = 'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="radio"], [role="switch"], [role="checkbox"]';
      for (const el of Array.from(document.querySelectorAll(sel))) {
        if (!visible(el)) continue;
        if (el.closest("[data-tap-exempt]")) continue;
        // A native checkbox/radio inside a <label> borrows the label's hit area.
        if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio") && el.closest("label")) continue;
        const r = el.getBoundingClientRect();
        if (r.width < MIN_TAP - 0.5 || r.height < MIN_TAP - 0.5) {
          taps.push({ what: label(el), size: `${Math.round(r.width)}×${Math.round(r.height)}`, route });
        }
      }

      const texts: Offender[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const seen = new Set<Element>();
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent?.trim()) continue;
        const el = n.parentElement;
        if (!el || seen.has(el) || !visible(el)) continue;
        if (el.closest("script, style, noscript, svg, [aria-hidden='true']")) continue;
        seen.add(el);
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < MIN_TEXT - 0.01) texts.push({ what: label(el), size: `${fs}px`, route });
      }
      return { taps, texts };
    },
    { MIN_TAP, MIN_TEXT, route }
  );
}

for (const vp of VIEWPORTS) {
  for (const scheme of ["light", "dark"] as const) {
    test.describe(`quality gates ${vp.width}×${vp.height} ${scheme}`, () => {
      test.use({ viewport: vp, colorScheme: scheme });
      for (const route of ROUTES) {
        test(`${route} meets tap-target and type floor`, async ({ page }) => {
          await page.goto(route);
          await page.waitForLoadState("networkidle");
          const { taps, texts } = await audit(page, route);
          expect(taps, `tap targets under ${MIN_TAP}px:\n${taps.map((t) => `${t.size} ${t.what}`).join("\n")}`).toEqual([]);
          expect(texts, `text under ${MIN_TEXT}px:\n${texts.map((t) => `${t.size} ${t.what}`).join("\n")}`).toEqual([]);
        });
      }
    });
  }
}
