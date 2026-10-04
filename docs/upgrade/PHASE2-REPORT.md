# Phase 2 report - Value upgrades (in progress)

Scope agreed 04/10/2026: Budget v2 → Plan-my-day → Bookings + paste-import (Anthropic, server-side) → Map sheet → **Steps counter** (added 04/10) → ICS export → Trip overview → Stats & stamps → Backup/export. Family votes: skipped (no new tables). One PR per item, merged on green CI; every flag stays **off** until checked on a phone.

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

## 2.2 Plan-my-day - flag `planMyDay` (off)

| Acceptance criterion | Result |
|---|---|
| Propose 3-4 items for an empty day from the bank | "תכנן לי את היום" on every empty day row (also inside collapsed runs). 2-3 sights + lunch (+ shop), shortlisted ideas first |
| Filter by segment | Day's country, then an area chip row (the day's own area first, then by idea count). Hotels, transport, towns and "other" are never proposed |
| Indoor/outdoor | "יום גשום - רק בפנים" switch drops nature/activity |
| Nearest-neighbour order, haversine, no paid API | `nearestNeighbourOrder`; lunch is the restaurant nearest the first sight |
| Travel-time estimate chips | Same model as Today's leave-by (`_shared/travel.ts`), labelled as an estimate |
| Accept all / swap one / regenerate | "הוספה ליום" creates items with suggested start times (and marks the ideas planned); "החלפה" per stop (same kind, nearest to its neighbour); "הצעה אחרת" rotates deterministically |
| Offline fallback | Rule-based only, no LLM. The slim bank is cached (`plan-candidates` query cache, also prefetched); proposing works offline, accepting needs a connection and says so |

Files: `lib/planMyDay.ts` (+test, 8), `lib/data/placeOptions.ts` (`loadPlanCandidates`, `acceptPlan`, optional start time on `planFromOption`), `components/itinerary/PlanMyDaySheet.tsx`, `LegSection.tsx`, `ItineraryScreen.tsx`, `lib/offline/queryCache.ts`, `lib/offline/prefetch.ts`, `lib/strings.ts`.

Security: `place_options` is owner-only (RLS `place_options_owner_all`); the cache holds only what that returned. No schema change.

❌ Kid-friendly filter: the bank has no kid-friendly field, so it is not filtered on. ❌ Opening hours: not in the bank, so times are a suggestion. ❌ About 40% of ideas have no coordinates; they still get proposed but without a travel chip (20 minutes assumed between stops).

## 2.x Steps counter (queued after the core 4) - flag `stepsCounter` (off until tested on both iPhones)

Spec from Hadar, 04/10/2026:
- Source: iPhone Health via an Apple Shortcuts personal automation (daily ~21:30) that POSTs today's step count to a Supabase Edge Function.
- Per-phone secret token, no Supabase keys on the phone; `verify_jwt` off, token checked in the function; rate-limited; kill switch.
- New table `daily_steps(member_id, date, steps, updated_at)`, unique `(member_id, date)`, upsert. Migration + rollback file.
- RLS: owners only read/write; kids and guests no access.
- UI: "צעדים היום" on in-trip Home (both parents), weekly bars, total per country stay; reused later in Stats & stamps.
- Hebrew setup guide for the Shortcut (about 2 minutes per phone).

Design notes (to confirm when building): the per-phone token needs somewhere to live - proposed a small `step_tokens(member_id, token_hash, created_at, last_used_at)` table (hash only, owners-only RLS, generated from Settings), so the phone holds a token that can be revoked without touching any Supabase key.
