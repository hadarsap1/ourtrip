# OurTrip upgrade - architecture as found (04/10/2026)

Items I could not verify from the code alone are marked ❌.

## What exists

| Area | Found | Where |
|---|---|---|
| Framework | Next.js 16.3 App Router, React 19.2, TypeScript, Tailwind v4 (`@theme` tokens in CSS) | `app/`, `app/globals.css` |
| Routing | One folder per route, all 23 routes in the brief exist, plus `/login`, `/kid-login`, `/offline` | `app/*/page.tsx` |
| Layout | `body` is one viewport tall, `<main>` is the only scroller, bottom bar is in flow (not fixed, see #75); desktop side rail at `lg` | `app/layout.tsx` |
| Auth | Supabase Auth behind `AuthGate`; kid devices via `kid-auth` function + WebAuthn; with no Supabase env, `AuthGate` bypasses (used by e2e) | `components/AuthGate.tsx`, `lib/webauthn.ts` |
| Data layer | Thin per-domain modules calling `supabase-js` directly from the client; no React Query/SWR; state is local `useState` per screen | `lib/data/*.ts` |
| Realtime | Supabase Realtime on itinerary, wall, checklists (migrations 00003/00004) | ❌ not traced per screen |
| Offline | IndexedDB `ourtrip-offline` v3 via `idb`: `documents_offline`, `today_itinerary`, `emergency_pages`, `phrasebook`, `pending_writes`, `map_snapshot`, `destination_facts` | `lib/offline/db.ts` |
| Write queue | `pending_writes`, **expenses only**, replayed in order on reconnect; transient errors stay, permanent errors dropped and counted | `lib/offline/queue.ts`, `components/OfflineSync.tsx` |
| Service worker | `ourtrip-shell-v14` (navigations, network-first, 4s timeout) + `ourtrip-assets-v1` (hashed assets, capped at 400) | `public/sw.js` |
| Documents | Supabase Storage bucket; offline copy is **opt-in per document** and AES-GCM wrapped under the vault key; PIN + passkeys | `lib/data/documents.ts`, `lib/docCrypto.ts` |
| Storage persistence | `navigator.storage.persist()` is **never called** (root cause of F1 with the opt-in copy) | - |
| Emergency | Defaults to today's country, else `pages[0]`; pages are sorted by `country_code`, so pre-trip it opens on **GE** (root cause of F5) | `components/emergency/EmergencyScreen.tsx:105-112` |
| Map | Google Maps JavaScript API; a static "today" snapshot blob is cached for offline | `components/map/MapScreen.tsx`, `lib/data/map.ts` |
| Segments | Not a table: "legs/stretches" are derived from consecutive `itinerary_days` sharing a country + label | `lib/data/segments.ts` |
| Notifications | Web Push with VAPID (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`), `push-send` Edge Function, pg_cron triggers (00010, 00019, 00025) | `lib/push.ts`, `supabase/functions/push-send` |
| AI | Anthropic called from Edge Functions only (`recommend`, `gmail-bookings`, `extract-places`, `phrasebook-generate`, `translate-phrase`, `facts-generate`, `emergency-autofill`); key in function env | `supabase/functions/*` |
| Theme | Light only. Tokens are `paper / ink / sea / sun / line / alert` in `@theme` | `app/globals.css` |
| Strings | Single `lib/strings.ts` | - |
| Tests | Vitest unit tests in `lib/`; Playwright smoke at 390×844 with no backend (11 tests) + an env-wired authenticated config | `e2e/`, `playwright*.config.ts` |

## Measured in code (supports the QA findings)

- F3: about 120 Tailwind arbitrary text sizes at 9-11px in `components/` and `app/`, plus `.ot-kicker` at 10.5px.
- F2: small hit areas come from icon buttons sized `h-7 w-7` / `h-8` and 40px tabs (`SegmentedControl`).
- F8: `DayFormSheet` takes a free-text `country_code`.
- Logical properties: 16 component files still use `left/right/ml/mr/pl/pr/text-left/text-right`.
- Bookings already have `type`, `status`, `confirmation_code`, `cost`, `currency`, `details jsonb`; expenses already keep `amount` + `currency` + `amount_ils`. The proposed schema extensions are smaller than the brief assumes.

## What I will change (structure, not features)

1. **Tokens:** keep the existing Tailwind names (`paper`, `ink`, `sea`, `line` …) and back them with CSS variables from `docs/design/tokens.css`, switched by `data-theme` on `<html>`. Screens keep compiling unchanged and get dark mode for free. An inline script in `<head>` sets the theme before paint (no flash).
2. **Flags:** typed config `lib/flags.ts` (defaults per phase, local override per device for testing). A `feature_flags` table only if a remote kill switch is needed (proposed, not applied).
3. **Offline:** `OfflineStatusProvider` (online, last sync, pending count) wraps the existing banner and queue. The queue gains `journal` and `note` kinds. Documents switch from opt-in to auto-download, then `storage.persist()`.
4. **Data loading:** cache-first for the top 6 routes by reading the IndexedDB snapshot before the network call, with route skeletons instead of "טוען…".
5. **Shared components** in `components/ui/` built on the tokens.

## Client-side `sync_queue` (IndexedDB, not a table)

Store `pending_writes` (exists) gains: `kind: "expense" | "journal" | "note"`, `payload`, `createdAt`, `attempts`, `lastError`, `fields` (names touched, for last-write-wins per field). Replay order is FIFO; transient errors keep the entry with backoff; permanent errors move to a `failed_writes` store (DB version 4) so nothing is lost silently.

## Not verified ❌

- RLS for kids and guests on every table. Policies exist through 00038; I will re-run the checks in `docs/SECURITY-CHECKS.md` before any migration, not assume.
- The live app's data (18 segments, segment names, 8 bookings): I have no credentials in this session. Supabase MCP is attached, but I will only use it read-only and only with your OK.
- iOS push only after install to home screen: true for iOS 16.4+ as far as I know; to verify on a device.
- Lighthouse and real-device performance: not runnable here.
