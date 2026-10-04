# E2E QA review - 04/10/2026

## How it ran

Playwright, Chromium, 390×844, he-IL, Asia/Jerusalem, against a production build.

There is no test Supabase project, so the browser talked to a **fake backend**:
- every `*.supabase.co` call was intercepted and answered by a small in-memory PostgREST;
- the fake trip: 5 countries, 50 days, items, bookings, documents, expenses, emergency, phrasebook;
- weather, FX and Maps were stubbed.

Signed in as a parent and as a kid; pre-trip (today) and in-trip (`simDate` 05/11/2026) with every Phase 2 flag on; light and dark.

The harness lives outside the repo (local `e2e-qa/`, git-excluded).

| Scenario | Count | Result |
|---|---|---|
| Owner pre-trip, every route, light + dark | 46 | pass |
| Owner in-trip, all Phase 2 flags, light + dark | 20 | pass |
| Kid device | 5 | pass (after fix 2) |
| Airplane mode reload (Home, Documents, Emergency, Phrasebook, Itinerary) | 5 | pass, each opens in ~1.7 s |
| Expired login + airplane mode | 1 | pass (after fix 3) |
| Never-opened screen offline | 1 | pass |
| Dead line, no answers at all (Documents, Emergency) | 2 | pass, 11 s / 13 s (after fix 1) |

Each screen was also audited for:
- `dir="rtl"`, horizontal overflow at 390 px;
- "undefined" / "NaN" / "Invalid Date" text, English words in the UI;
- tap targets under 32 px;
- page errors and console errors;
- a loader that never ends.

## Bugs found and fixed

1. **Every failed read took ~7 s offline.** postgrest-js 2.110 retries a failed GET 3 times (1/2/4 s). A screen with three reads in a row (Emergency) sat on its loader for 20+ s, even with the 30 s dead-line switch on. Fix: `guardedFetch` reports every failure it causes, and every plain network failure, as an `AbortError`. postgrest-js never retries an abort, and auth still treats it as retryable, so the saved login is kept. Unit test runs the real PostgrestClient and asserts exactly one attempt.
2. **Kid home crashed** ("This page couldn't load"): "cannot add `postgres_changes` callbacks for realtime:messages-sync after `subscribe()`". The cause: fixed channel names. supabase-js hands back an existing channel with the same name, so a quick re-subscribe got an already-subscribed one. Fix: a unique topic per subscription (`lib/realtimeTopic.ts`) for messages, itinerary, bookings and checklists. Messages, Checklists and Itinerary also no longer subscribe after the screen has closed (no orphan channels).
3. **Offline pages opened unstyled and inert** right after an update. The service worker cached the page HTML but not the CSS/JS it references: the page that installs the worker loads them before the worker controls it, and screens not opened since the deploy never fetched theirs. Fix: on install the worker reads every cached page and precaches the `/_next/static/*.css|js` it references (shell cache v15). Verified both ways: fails on the old worker (icons 334 px wide), passes on the new one.
4. Amounts: "₪179,815.5" → whole amounts stay whole, others always show 2 decimals.
5. Home header showed the country code ("האנוי, VN") → Hebrew country name.

## Not bugs

- English words in the audit came from QA fixture values (an invalid document tag, a text mood instead of an emoji, English phrasebook categories). The app itself uses Hebrew keys or emoji there. "Google Maps" and "Google Photos" are brand names.
- The FAB over the last button on Home exists only mid-scroll. At the end of the scroll there is room below.
- The metro line clips its last stop at the screen edge. It is a horizontal scroller.

## Not covered (❌)

- Real Supabase: RLS, realtime delivery and Edge Functions were not exercised. RLS is covered by the local Postgres tests in `docs/SECURITY-CHECKS.md`.
- iOS Safari. Chromium only; the phones are iPhones and an Android tablet.
- Push notifications, camera, the passkey unlock.
