# Phase 0 report - Foundation (04/10/2026)

## 1. What shipped

| Item | Finding | Result |
|---|---|---|
| Theme system | F7 | Light / dark / system, saved per device, no flash (head script). Existing color names now read v2 tokens, so every screen follows the theme. Picker on More |
| Type floor | F3 | 121 text sizes under 12px raised to 12px; kicker label 10.5 → 12px; every form field 16px (unlayered CSS rule) |
| Tap targets | F2 | Unlayered CSS floor: every button, link, tab, radio, switch and field at least 44×44. Opt-out only with `data-tap-exempt` |
| Country picker | F8 | Searchable, flags, Hebrew spelling variants, in the day form and the new emergency page form |
| Skeletons + cache-first | F9 | Skeletons on the top 6 routes. Trip row stored on the device; itinerary and budget paint cached data from IndexedDB first, then refresh |
| Offline status | F10 | One store (online, last sync, pending count); banner "אין חיבור - הנתונים נשמרו במכשיר" with "סונכרן לאחרונה …" and pending changes |
| Emergency country | F5 (Phase 1 item, done early) | Opens on today's country, else the next one; was the alphabetically first page (GE) |
| Segment cleanup | F6 (Phase 1 item, done early) | Dry run only; `docs/upgrade/segment-cleanup.md` |
| Shared components | - | `components/ui/`: Button, IconButton, Chip, Badge, CountryChip, CountdownChip, ProgressBar, Ring, Stepper, Card, Tile, ListRow, EmptyState, BottomSheet (3 snaps), undo toast, FAB, Skeleton, CountryPicker |
| Logical CSS | - | `npm run report:rtl`; 15 files converted, report now empty |
| Flags | - | `lib/flags.ts` |

## 2. Test results

| Suite | Result |
|---|---|
| Vitest unit | 398 passed, 0 failed (34 files) |
| Quality gates (`npm run test:gates`) | 32 passed - 8 routes × 390 and 360 × light and dark |
| Smoke e2e | 67 passed (one test updated: light `theme-color` still matches the manifest; dark adds its own tag) |
| Offline banner e2e | passed |
| Type check, lint, build | clean |

Screenshots taken during the work (not committed): light and dark of `/`, `/itinerary`, `/more`, `/emergency`, the country picker, and the component set.

## 3. Flags

All Phase 0 and Phase 1 flags default **on**; Phase 2 and 3 **off**. Phase 0 flags in use: `themeSwitch`, `offlineStatus`, `routeSkeletons`, `countryPicker`; plus `emergencyAutoCountry` (Phase 1).

## 4. Migrations

None proposed or applied in Phase 0. Client IndexedDB `ourtrip-offline` v3 → v4 (adds `query_cache`), backward compatible.

## 5. Open risks and ❌

- ❌ The gates run without a backend: data-driven rows (day cards, bookings, expenses) are covered by the CSS floor but not measured. Run the gates with `playwright.auth.config.ts` or check on a phone.
- ❌ Making every control at least 44px tall can loosen tight rows that only render with data (status chips in day cards, small inline buttons). Visual check needed after deploy.
- Cache-first stores itinerary and budget data (not documents) in IndexedDB on owner devices, unencrypted, like the existing today snapshot. Documents stay skeleton-only until Phase 1 handles the PIN state offline.
- `getActiveTrip` now answers from the stored trip first. Correct while there is one active trip (DECISIONS #8).
- ❌ Vercel project and team names for the rollback CLI are not verified (`ROLLBACK.md`).

## 6. Recommendation

Turn on: everything in Phase 0 (already on by default). Merge after one look at `/itinerary`, `/budget` and `/documents` on a real phone with data, in both themes.
Hold: nothing in Phase 0. The F6 renames wait for your decision on Kyoto (join 30/03-02/04 with 03/04-09/04 or not).
