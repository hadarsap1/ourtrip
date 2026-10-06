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

## 2.1 Bookings + paste-to-import - flag `bookingsV2` (off)

| Acceptance criterion | Result |
|---|---|
| Tile grid with counts by type | "הכול" + one tile per type with live (not cancelled) count; tap filters the list |
| Rich booking card | Status badge and price (existing) + facts strip: big departure/arrival or check-in/out times, flight number, terminal, gate, provider chips, confirmation code with Copy |
| Detail view | ❌ Covered by the rich card plus the existing edit sheet (tap the card); no separate read-only screen |
| Paste-to-import | "הדבקת אישור הזמנה" → `booking-paste` Edge Function → one booking with confidence per field → review form (low-confidence fields flagged "לבדוק") → save. Nothing is saved before the owner presses save |

Server (`supabase/functions/booking-paste`): owner-only (verify_jwt + role re-check before reading the body), kill switch `BOOKING_PASTE=off`, rate limits in `ai_usage` (30 per parent per day, 60 per trip per day, counted before the call), model from `BOOKING_PASTE_MODEL`, 20 s timeout, schema-pinned tool output re-validated by `_shared/bookingPaste.ts` (`sanitizePaste`, tested), logs metadata only (length, duration, outcome) - never the pasted text. Prompt-injection containment as in gmail-bookings.

Data: new fields go into `bookings.details` (`departure_time`, `arrival_time`, `provider`, `source: "paste"`, `confidence`) - no bookings migration. New table `ai_usage` (migration 00041, approved 04/10): counts only, service-role writes, owners read, kids/guests nothing.

Files: `supabase/functions/booking-paste/index.ts`, `supabase/functions/_shared/bookingPaste.ts` (+test), `supabase/migrations/00041_ai_usage.sql` (+down), `lib/data/bookingPaste.ts` (+test), `lib/bookingsV2.ts` (+test), `components/bookings/BookingsV2Parts.tsx`, `components/bookings/PasteImportSheet.tsx`, `BookingsList.tsx`, `ItineraryScreen.tsx`, `lib/strings.ts`.

❌ The booking form does not edit `departure_time`/`arrival_time` yet (paste fills them; the card shows them).
❌ Paste is online-only by nature; offline it says so.

## 2.9 Map bottom sheet - flag `mapSheet` (off)

| Acceptance criterion | Result |
|---|---|
| Split layout, draggable bottom sheet | Map fills the screen; the existing `BottomSheet` (peek / half / full, drag or tap the grabber) sits over it |
| Tabs מסלול / ימים / הזמנות | Route: country stays as a timeline (tap frames that stay on the map), then the existing pin / route / car tools. Days: chips outlined in their country's colour, tap filters the map. Bookings: live bookings by date with a navigate link (address, else title) |
| Category pins | Items that came from a booking show its type glyph (✈️ 🏨 🚆 🚗 🎟️); others stay plain dots |
| Country-coloured route | One geodesic line through each day's centroid in date order, each leg in the arrival country's colour (`tokens.json` light base) |
| Day chips coloured by segment | Yes (country colour) |

Files: `lib/mapV2.ts` (+test, 4), `components/map/MapV2Layout.tsx`, `components/map/MapScreen.tsx` (layout switch, country colours, trip line, `focusStretch`), `lib/strings.ts`.

Security: no schema or policy change; the bookings tab reads `bookings` like the itinerary does (owners; guests have their own read-only map).

❌ Ideas-bank categories are not on itinerary items, so "category pins" covers booking-linked items only. ❌ The trip line needs located items; days without any are skipped (most of the trip today). ❌ Not checked against a live Google Map here (no API key in this environment) - verify on a phone.

## 2.x Steps counter - flag `stepsCounter` (off until tested on both iPhones)

Spec (Hadar, 04/10) → result:

| Requirement | Result |
|---|---|
| iPhone Health via Shortcuts automation (~21:30) POSTs today's steps | `steps-ingest` Edge Function; guide in-app (More → "ספירת צעדים מהאייפון") and `docs/STEPS-SHORTCUT.md` |
| Per-phone secret token, no Supabase keys on the phone | 256-bit token made in the app, shown once; only its SHA-256 is stored (`step_tokens`) |
| verify_jwt off, token checked in the function, rate-limited, kill switch | Token must be unrevoked and an owner's; 20 s per-phone throttle; `STEPS_INGEST=off`; fails closed; logs codes only |
| `daily_steps(member_id, date, steps, updated_at)`, unique, upsert | Primary key `(member_id, date)`, upsert; steps 0..200000; date within 3 days back / 1 ahead |
| Migration + rollback | `supabase/migrations/00042_steps.sql`, `docs/upgrade/migrations/00042_steps.down.sql`, local RLS test `00042_steps.test.sql` |
| RLS owners only | Tested locally - see `docs/SECURITY-CHECKS.md` |
| "צעדים היום" on in-trip Home, weekly bars, total per country stay | `StepsCard` under now/next: both parents, paired 7-day bars, "בשהות ב…" total; cache-first |
| Reuse in Stats & stamps | `lib/stepsView.ts` (`totalBetween`, `weekBars`) is pure and ready |

Files: `supabase/migrations/00042_steps.sql`, `supabase/functions/steps-ingest/index.ts`, `supabase/functions/_shared/stepsIngest.ts` (+test 4), `lib/stepsView.ts` (+test 3), `lib/data/steps.ts`, `components/today/StepsCard.tsx`, `components/settings/StepsSettings.tsx`, `components/today/TodayScreen.tsx`, `components/more/MoreScreen.tsx`, `docs/STEPS-SHORTCUT.md`.

❌ Hebrew names of Shortcuts actions vary by iOS version; the guide gives the English names too. Tested live 06/10/2026 on Hadar's iPhone: token created in-app, Shortcut POST → 200, 3,147 steps stored for 06/10 (a first try with GET → 405, now called out in the guide). ❌ Sivan's iPhone not yet set up - the flag stays off for everyone until both phones report. 00041 and 00042 applied 06/10/2026 (versions 20261006103933 `ai_usage`, 20261006104002 `steps`).

## 2.7 ICS export - flag `icsExport` (off)

"ייצוא ליומן" in the bookings tab downloads `ourtrip.ics`: one all-day event per country stay (not 230 day events) and one per live booking - timed from `details` (departure/arrival or check-in/out, floating local time; an overnight flight ends the next day) or all-day when no times. RFC 5545: CRLF, UTF-8-safe 75-octet folding, escaped text, exclusive all-day DTEND. Cancelled and undated bookings are skipped. Built on the device from data already loaded - nothing leaves the phone except into the user's own calendar app.

Files: `lib/ics.ts` (+test 3), `components/bookings/BookingsList.tsx`, `components/itinerary/ItineraryScreen.tsx`, `lib/strings.ts`.

❌ Not imported into a real iOS/Google calendar here - check once on a phone. ❌ A re-export creates duplicates in calendars that ignore UID (Apple Calendar import does).

## 2.5 Trip overview - flag `tripOverview` (off)

Metro line inside the trip summary at the top of the itinerary: one station per stay, sideways in reading order (right to left), track coloured by the country it runs into, a flag at each country change, past stays faded, the current stay as the big station ("אנחנו כאן") scrolled into view first. Tapping a station opens and scrolls to that stay. The "world map with arcs" already exists as the itinerary's map view (`TripMap`, #70), so it was not rebuilt.

Files: `lib/metroLine.ts` (+test 2), `components/itinerary/MetroLine.tsx`, `TripSummary.tsx`, `ItineraryScreen.tsx`, `lib/strings.ts`. No data or policy change.

## 2.6 Stats & stamps - flag `statsStamps` (off)

New page `/stats` ("הטיול במספרים"), reached from More (parents) and a "הדרכון שלי" tile on the kids' Home:
- countries visited / total, days done / total, km on the plan so far / total (great-circle between day centroids, labelled as such);
- nights per country so far, bars in country colours;
- parents' steps since departure when `stepsCounter` is on (owners only - kids never query steps; RLS would return nothing anyway);
- a passport page: one stamp per country in order of first arrival - solid with arrival date once there, dashed/grey "בקרוב" before.

Reads only what each role may already read (itinerary days/items; kids have SELECT on both). Cache-first from the itinerary cache, so it opens offline.

Files: `lib/tripStats.ts` (+test 4), `components/stats/StatsScreen.tsx`, `app/stats/page.tsx`, `components/more/MoreScreen.tsx`, `components/today/TodayScreen.tsx`, `lib/strings.ts`.

❌ km are straight-line between planned places, not road distance. ❌ With the flag off the page renders empty (only the flagged tiles link to it).

## 2.8 Backup / export - flag `backupExport` (off)

More → "גיבוי הטיול" (parents only):
- **Export**: one JSON file (`ourtrip-backup-YYYY-MM-DD.json`) with the trip, days, items, bookings (+ attachment metadata), budget, expenses, ideas bank, journal, checklists, visas, emergency pages, pins, routes, phrasebook, facts, wall messages, photo metadata, pocket money. **Not included**: documents and their PIN/passkeys, push subscriptions, kid devices, the guest allowlist, Google Photos links, read receipts, FX cache, member emails and auth ids; attachments/photos as metadata only.
- **Restore dry run**: pick a backup file → validated (app, version, shape; a file that contains an excluded table is rejected) → compared with the current data per table: rows that would come back, rows that would change (ignoring `updated_at`), rows created since. **Nothing is written**; there is no restore-apply in this phase.

The server-side weekly backup (`backup-weekly` → private bucket) is unchanged.

Files: `lib/backup.ts` (+test 4), `lib/data/backup.ts`, `components/settings/BackupCard.tsx`, `components/more/MoreScreen.tsx`, `lib/strings.ts`.

Security: reads only through the owner's own session (RLS); kids/guests never see the card. The file lands on the parent's phone - it contains the itinerary, bookings with confirmation codes and the budget, so it should be kept like any private file.

❌ Not exercised against the live database here (no signed-in session); verify once on a phone. ❌ A full restore (writing back) is intentionally not built.
