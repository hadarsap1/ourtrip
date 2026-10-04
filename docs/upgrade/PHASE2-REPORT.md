# Phase 2 report - Value upgrades (in progress)

Scope agreed 04/10/2026: Budget v2 → Plan-my-day → Bookings + paste-import (Anthropic, server-side) → Map sheet → ICS export → Trip overview → Stats & stamps → Backup/export. Family votes: skipped (no new tables). One PR per item, merged on green CI; every flag stays **off** until checked on a phone.

## 2.4 Budget v2 - flag `budgetV2` (off)

| Acceptance criterion | Result |
|---|---|
| Hero "נשאר להיום" | Big number from `todayAllowance` (same math as Home), turns red as "חריגה היום" when today's share is exceeded; "left for the whole trip" under it |
| Rings per category | 2-3 column grid, ring = spent / planned, warning color when over plan, tap opens the existing category sheet |
| Per-country tab | Spending per country by the itinerary day each expense falls on; days so far / planned; ILS per day; pre-trip and country-less spending shown separately |
| Daily burn sparkline | Last 14 days, inline SVG, today's total beside it |
| End-of-segment summary | One card per country visit that has ended: nights, dates, total, per day, top category |
| Offline FX with "last updated" | Every network-resolved rate is kept on the device (`lib/fxCache.ts`); lookups fall back to it offline; the 6-hourly prefetch warms every route currency + USD; stamp "שערי מטבע עודכנו …" under the budget |

Also: `Ring` no longer draws a stray dot at 0%.

Files: `lib/budgetV2.ts` (+test), `lib/fxCache.ts` (+test), `lib/data/expenses.ts` (device fallback, `warmFxRates`), `lib/offline/prefetch.ts`, `components/budget/BudgetV2.tsx`, `components/budget/BudgetScreen.tsx`, `components/ui/Progress.tsx`, `lib/strings.ts`.

Tests: 441 unit (+9), quality gates 32/32, build/type/lint clean. Visual: both tabs, light and dark, 390px, no tap target under 44px.

Security: no schema or policy change; reads only what the screen already loaded (owners). The FX cache holds public exchange rates only.

❌ Countries have no planned budget of their own (no column), so the country tab shows spend and pace, not "left per country".
❌ A visit spanning a country change mid-day is assigned by the itinerary day's country.
