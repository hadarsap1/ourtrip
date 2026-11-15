// Opens every screen as a parent, a kid, a guest and nobody against the local
// stack (see README.md) and records what a person would trip over: failed
// requests, console errors, tap targets under 44px, text under 12px, controls
// with no name, sideways scroll. One screenshot per screen.
//   node scripts/uicrawl/crawl.mjs [roles] [schemes] [outDir]
//   node scripts/uicrawl/crawl.mjs owner,kid,guest,anon light,dark /tmp/shots
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("@playwright/test");
import { sign } from "./jwt.mjs";
import fs from "node:fs";
const BASE = process.env.CRAWL_BASE_URL ?? "http://localhost:3200";
const USERS = {
  owner: { sub: "aaaaaaaa-0000-0000-0000-000000000001", email: "abba@test.local" },
  kid: { sub: "aaaaaaaa-0000-0000-0000-000000000003", email: "kid1@test.local", member_id: "bbbbbbbb-0000-0000-0000-000000000003" },
  guest: { sub: "aaaaaaaa-0000-0000-0000-000000000005", email: "savta@test.local" },
  anon: null,
};
const ALL = ["/", "/itinerary", "/budget", "/photos", "/more", "/stories", "/jar", "/facts", "/messages", "/podcast", "/map", "/documents", "/checklists", "/emergency", "/phrasebook", "/guests", "/kids", "/settings", "/stats", "/notifications", "/ready", "/visas", "/options", "/recommend", "/memory-book", "/pocket"];
const ROUTES = {
  owner: ALL,
  kid: ["/", "/itinerary", "/messages", "/photos", "/stories", "/facts", "/jar", "/emergency", "/phrasebook", "/settings", "/more", "/budget", "/documents", "/pocket", "/podcast", "/map"],
  guest: ["/", "/stories", "/podcast", "/photos", "/messages", "/map", "/settings", "/jar", "/budget", "/documents", "/itinerary", "/facts"],
  anon: ["/login", "/kid-login", "/join/demo1234", "/join/badtoken", "/", "/offline", "/auth/confirm", "/s/nope"],
};
const roles = (process.argv[2] || "owner,kid,guest,anon").split(",");
const schemes = (process.argv[3] || "light").split(",");
const out = process.argv[4] || "shots";
fs.mkdirSync(out, { recursive: true });
const report = [];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const role of roles) for (const scheme of schemes) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: scheme, locale: "he-IL", serviceWorkers: "block" });
  const u = USERS[role];
  if (u) {
    const token = sign({ ...u, role: "authenticated", aud: "authenticated" });
    const session = { access_token: token, refresh_token: "r", token_type: "bearer", expires_in: 604800, expires_at: Math.floor(Date.now() / 1000) + 604800, user: { id: u.sub, email: u.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} } };
    await ctx.addInitScript((s) => localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)), session);
  }
  for (const route of ROUTES[role]) {
    const page = await ctx.newPage();
    const errs = [], bad = [];
    page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
    page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message.slice(0, 200)));
    page.on("response", (r) => { const url = r.url(); if (r.status() >= 400 && url.includes("54321")) bad.push(r.status() + " " + r.request().method() + " " + url.replace("http://localhost:54321", "").slice(0, 140)); });
    let status = 0;
    try { const resp = await page.goto(BASE + route, { waitUntil: "load" }); status = resp?.status() ?? 0; await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(1200); } catch (e) { errs.push("NAV " + e.message.slice(0, 100)); }
    const audit = await page.evaluate(() => {
      const vis = (el) => { const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false; const cs = getComputedStyle(el); return cs.visibility !== "hidden" && cs.display !== "none" && +cs.opacity > 0; };
      const lab = (el) => `${el.tagName.toLowerCase()}${el.getAttribute("aria-label") ? `[${el.getAttribute("aria-label")}]` : ""} "${(el.textContent ?? "").trim().slice(0, 28)}"`;
      const taps = [], texts = [], unnamed = [], over = [];
      for (const el of document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="switch"]')) {
        if (!vis(el) || el.closest("[data-tap-exempt]")) continue;
        if (el instanceof HTMLInputElement && ["checkbox", "radio"].includes(el.type) && el.closest("label")) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 43.5 || r.height < 43.5) taps.push(`${Math.round(r.width)}x${Math.round(r.height)} ${lab(el)}`);
        const name = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || el.getAttribute("placeholder") || "").trim();
        const labelled = el.id && document.querySelector(`label[for="${el.id}"]`) || el.closest("label") || el.getAttribute("aria-labelledby");
        if (!name && !labelled && !el.querySelector("img[alt]")) unnamed.push(lab(el) + " " + (el.className || "").toString().slice(0, 40));
        if (r.right > innerWidth + 1 || r.left < -1) over.push(lab(el));
      }
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const seen = new Set();
      for (let n = w.nextNode(); n; n = w.nextNode()) { if (!n.textContent?.trim()) continue; const el = n.parentElement; if (!el || seen.has(el) || !vis(el) || el.closest("script,style,noscript,svg,[aria-hidden='true']")) continue; seen.add(el); const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 11.99) texts.push(`${fs}px ${lab(el)}`); }
      const main = document.querySelector("main");
      const imgsNoAlt = [...document.querySelectorAll("img")].filter((i) => vis(i) && !i.hasAttribute("alt")).length;
      const latin = [...new Set((document.body.innerText.match(/\b[A-Za-z][A-Za-z ]{5,}\b/g) || []))].slice(0, 8);
      return { taps, texts, unnamed, over, hscroll: (main ? main.scrollWidth > main.clientWidth + 1 : false) || document.documentElement.scrollWidth > innerWidth + 1, imgsNoAlt, latin, title: document.title, h1: document.querySelectorAll("h1").length, text: document.body.innerText.replace(/\s+/g, " ").slice(0, 260), url: location.pathname };
    }).catch((e) => ({ err: e.message }));
    const name = `${role}-${scheme}-${route.replace(/\//g, "_") || "_"}.png`;
    await page.screenshot({ path: `${out}/${name}`, fullPage: false }).catch(() => {});
    report.push({ role, scheme, route, status, errs: [...new Set(errs)].slice(0, 6), bad: [...new Set(bad)].slice(0, 8), ...audit });
    await page.close();
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${out}/report-${roles.join("_")}-${schemes.join("_")}.json`, JSON.stringify(report, null, 1));
for (const r of report) console.log(`${r.role} ${r.scheme} ${r.route} -> ${r.url} [${r.status}] errs:${r.errs.length} bad:${r.bad.length} taps:${r.taps?.length} txt:${r.texts?.length} unnamed:${r.unnamed?.length} hscroll:${r.hscroll} over:${r.over?.length}`);
