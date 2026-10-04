# Phase 1 report - Core trip features (04/10/2026)

Branch `claude/lucid-pascal-tjjru5-phase1`, stacked on Phase 0 (`claude/lucid-pascal-tjjru5`, PR #77).

## 1. What shipped

| Item | Finding | Result |
|---|---|---|
| 1.1 Offline documents | F1 | Owner documents download automatically while the vault key is in memory. Copies stay AES-GCM wrapped (PIN files are already ciphertext). Per-file status, "sync all" bar with progress, `navigator.storage.persist()` requested |
| 1.2 Write queue v2 | - | Expenses, journal entries and day notes queue offline. Backoff, a failed-writes store, field-level last-write-wins via `updated_at`, conflicts surfaced as a toast. IndexedDB v5 |
| 1.3 Prefetch | - | Every 6h online: itinerary bundle (14 days), budget, emergency, phrasebook, owner documents |
| 1.4 Documents | - | Expiry chips (expired / within 6 months), missing-insurance prompt, share and copy of details work offline. Nothing is sent to a third party |
| 1.5 Itinerary | F4 | Country header sticks while a leg is open, country edge stripe, runs of empty days collapse to one row with "תכנן מהבנק", timeline spine with type icons, floating "קפיצה להיום", swipe a row to move or delete with undo |
| 1.6 Today, pre-trip | - | Hero with first country, countdown and readiness ring, budget card with "נשאר להיום", country carousel with countdown chips and planned-days bar, urgent list, quick actions |
| 1.6 Today, in-trip | - | "Now" and "next" cards, leave-by estimate (distance based, labelled as estimate), navigate button to the maps app, local and Israel clocks (shown only when they differ), evening journal card from 18:00. Existing agenda, weather, tonight's bed, spend tiles and SOS kept |
| 1.6 Emergency | F5 | "Available offline" badge per country |
| 1.7 Capture FAB | - | Owners only, every screen except login/kids/guests: expense (keypad, currency chips last-used first, category chips, works offline), note → journal, photo, scan |
| 1.10 simDate | - | `?simDate=YYYY-MM-DD` in dev or with the `simDate` flag, with a banner |
| 1.11 Notifications | - | In the family's local time (zone of today's itinerary country): 09:00 cancellation and visa deadlines (7/3/1 days), 19:00 tomorrow digest, 20:00 evening journal (skips whoever already wrote), leave-now every 15 min. Quiet hours 22:00-07:00. iOS install hint card on Home |

## 2. Test results

| Suite | Result |
|---|---|
| Vitest unit | 432 passed, 0 failed (45 files) |
| Quality gates | 32 passed (8 routes × 390 / 360 × light / dark) |
| Smoke + offline e2e | 67 passed |
| Type check, lint, build | clean |
| Visual | Pre-trip Home light/dark, in-trip now/next (leave-by and leave-now states), iOS hint, offline docs bar, empty-day runs, swipe row, FAB sheet checked from screenshots against fake data |

## 3. Flags

On by default: `documentsAutoDownload`, `writeQueueV2`, `itineraryV2`, `todayV2`, `captureFab`, `emergencyAutoCountry`, `notificationsV2`. Off: `simDate` (dev builds always allow it). `writeQueueV2` is declared but not wired: the queue rewrite can only be rolled back by redeploying. `notificationsV2` covers the client part (iOS hint); the server pushes have their own kill switch, `NOTIFY_V2=off` on the `push-send` function, because a client flag cannot stop a cron job.

## 4. Migrations

- **Proposed, not applied:** `docs/upgrade/migrations/00043_push_v2_schedules.sql` (+ `.down.sql`). Adds two pg_cron jobs (`push-hourly`, `push-leave-now`). No schema or data change. Apply only after `push-send` is deployed.
- **Proposed in PLAN, not written:** a `paid_by` column on expenses ("who paid" in the FAB sheet) and per-member quiet hours.
- Client: IndexedDB `ourtrip-offline` v4 → v5 (adds `failed_writes`), backward compatible.
- RLS: no policy change. Queued writes replay through the same client and policies; offline document copies are only fetched by owners (storage policies already block kids and guests).

## 5. Open risks and ❌

- ❌ The new notifications do nothing until `push-send` is redeployed **and** the 00043 cron jobs are applied. Neither was done from here.
- ❌ Cancellation reminders read `bookings.details.free_cancel_until`. Nothing writes that key yet, so this reminder stays silent until the booking form (Phase 2 `bookingsV2`) or the Gmail import fills it.
- ❌ Leave-by is a straight-line estimate (×1.3 road factor, 22 km/h, 10 min buffer). It ignores traffic, ferries and walking-only areas. Labelled "הערכה" in the UI.
- ❌ Visa stay-limit reminders assume one contiguous stretch per country. A second visit to the same country (e.g. back to Thailand) is measured from the first entry.
- ❌ Local time follows the itinerary's country, not the phone. On a border-crossing day the zone switches at UTC midnight, so one slot can fire an hour early or late.
- Nights stepper (F4) not built: changing a stretch's nights shifts every later day, which is a bulk data operation. Needs your decision on the behavior first.
- Data-driven screens were checked with fake data only; gates run without a backend.

## 6. Recommendation

Turn on: everything listed in section 3 (already on). Merge after #77, then one pass on a real phone with data: `/documents` (offline bar, airplane mode), `/itinerary` (swipe, empty runs), Home pre-trip.
Then deploy `push-send` and apply 00043, and set `?simDate=2026-11-05` on a phone to see in-trip mode.
Hold: nights stepper and "who paid" until you decide (questions below).

Open decisions:
1. Nights stepper: when Vietnam gets one more night, should every later day move forward one day (my default), or should the next country lose a night?
2. "Who paid": add the `paid_by` column now (small, additive), or skip for this trip?
3. Kyoto rename in `segment-cleanup.md` (joins two segments) - still open from Phase 0.
