// Regenerates every PWA icon from one vector definition, so the home-screen
// icon, the maskable Android icon and the iOS touch icon can never drift apart
// again. Run with `node scripts/generate-icons.mjs` after changing the mark.
//
// Rendering goes through the Chromium that Playwright already installs - no new
// dependency (CLAUDE.md rule #7). The mark is the "O" of OurTrip: a white ring
// on brand sea (--color-sea, #0e7c6b).
//
// Three shapes, because the platforms mask differently:
//   any       rounded square with transparent corners - used as-is by browsers
//             and by Chrome's install dialog, so it must look finished alone.
//   maskable  FULL BLEED. Android crops it to whatever shape the launcher uses,
//             so the teal has to reach all four edges and the ring has to stay
//             inside the inner 80% safe zone or it gets sliced.
//   apple     opaque square, no rounding and no transparency: iOS applies its
//             own squircle and renders transparency as black.

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEA = "#0e7c6b";

/** @param {{size:number, shape:"any"|"maskable"|"apple"}} opts */
function markSvg({ size, shape }) {
  const s = size;
  // Ring proportions. The maskable ring is deliberately smaller: the safe zone
  // is the inner 80% circle, so a 62.5% ring would touch its edge.
  const ringOuter = shape === "maskable" ? 0.56 : 0.625;
  const stroke = ringOuter * 0.2 * s; // same visual weight at every size
  const r = (ringOuter * s - stroke) / 2;

  const bg =
    shape === "any"
      ? `<rect x="${s * 0.016}" y="${s * 0.016}" width="${s * 0.968}" height="${s * 0.968}" rx="${s * 0.195}" fill="${SEA}"/>`
      : `<rect width="${s}" height="${s}" fill="${SEA}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  ${bg}
  <circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="none" stroke="#ffffff" stroke-width="${stroke}"/>
</svg>`;
}

const TARGETS = [
  { file: "public/icons/icon-192.png", size: 192, shape: "any" },
  { file: "public/icons/icon-512.png", size: 512, shape: "any" },
  { file: "public/icons/icon-maskable-512.png", size: 512, shape: "maskable" },
  // Next.js turns app/apple-icon.png into <link rel="apple-touch-icon">.
  { file: "app/apple-icon.png", size: 180, shape: "apple" },
];

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const page = await browser.newPage();

for (const { file, size, shape } of TARGETS) {
  const svg = markSvg({ size, shape });
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0;background:transparent">${svg}</body>`
  );
  const png = await page.screenshot({
    omitBackground: shape === "any", // keep the corners transparent
    clip: { x: 0, y: 0, width: size, height: size },
  });
  const out = resolve(ROOT, file);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, png);
  console.log(`${file}  ${size}x${size}  (${shape})`);
}

await browser.close();
