# OurTrip upgrade - plan

Dates: Phase 0 by 12/10, Phase 1 by 20/10, Phase 2 by 25/10, freeze 26/10, departure 31/10/2026.
One task = one commit, `feat|fix|chore(area): summary`. Every new feature behind a flag in `lib/flags.ts`.

## Phase 0 - Foundation

| # | Task | Fixes | Notes |
|---|---|---|---|
| 0.1 | `lib/flags.ts` typed flags + per-device override | - | Phase 1 on, Phase 2 on after tests, Phase 3 off |
| 0.2 | Tokens: `docs/design/tokens.css` → `globals.css`, existing names aliased to variables | F7 | No screen code change needed |
| 0.3 | Theme: light / dark / system, persisted per device, no-flash head script, picker in More | F7 | |
| 0.4 | Type floor: replace 9-11px sizes with 12/14; `.ot-kicker` to 12px; inputs 16px | F3 | Mechanical, reviewed per file |
| 0.5 | Tap targets: icon buttons 44×44, `SegmentedControl` 44, 8px gaps; `.tap` hit-area helper | F2 | Visual size can stay smaller, hit area cannot |
| 0.6 | `components/ui/`: Button, IconButton, Chip, CountryChip, CountdownChip, Badge, Progress, Ring, Stepper, Tile, ListRow, Card, BottomSheet (3 snaps), Toast + Undo, Skeleton, EmptyState, FAB | - | Extends existing `Sheet`, `Toast`, `SegmentedControl` instead of duplicating them |
| 0.7 | `OfflineStatusProvider` + banner + "סונכרן לאחרונה" indicator | F10 | Wraps existing `OfflineBanner`/`OfflineSync` |
| 0.8 | Skeletons + cache-first for `/`, `/itinerary`, `/budget`, `/documents`, `/emergency`, `/phrasebook` | F9 | |
| 0.9 | Country picker (searchable, flag) replacing free-text code in `DayFormSheet` | F8 | |
| 0.10 | Lint report for physical left/right CSS | - | Report + fixes in touched files |
| 0.11 | Playwright gates at 390×844 and 360×800: no hit area under 44, no text under 12 on the top 8 routes; dark-mode screenshots | F2, F3 | Runs without backend (AuthGate bypass) |

## Phase 1 - Before departure

| # | Task | Fixes |
|---|---|---|
| 1.1 | Documents auto-download + per-file status + "הורד הכל" + `storage.persist()` after first sync | F1 |
| 1.2 | Write queue: journal + note kinds, attempts/backoff, `failed_writes`, pending count | F10 |
| 1.3 | Next-14-days snapshot: itinerary, bookings, emergency + phrasebook for current and next country | F1 |
| 1.4 | Documents: expiry chips, missing-insurance prompt, offline share/copy (no third-party upload) | - |
| 1.5 | Itinerary: sticky country header + nights stepper + planned bar, timeline spine, empty-day groups, floating "היום", swipe + undo | F4 |
| 1.6 | Today pre-trip hero + segments carousel; in-trip mode by date (now/next, leave-by, local vs Israel time, cached weather, navigate, timeline, journal prompt, SOS) | - |
| 1.7 | FAB (expense, note, photo, scan) + expense sheet (keypad, currency chips last-used first, category, who paid), all offline | - |
| 1.8 | Emergency: current country by date, else next segment, GPS only if already granted; offline-ready badge | F5 |
| 1.9 | `scripts/segment-cleanup.mjs --dry-run` → `docs/upgrade/segment-cleanup.md`; proposes Hebrew names, flags duplicates, never merges | F6 |
| 1.10 | `?simDate=YYYY-MM-DD` in dev or behind flag | - |
| 1.11 | Notifications: evening journal, tomorrow digest, leave-now, cancellation + visa deadlines, quiet hours, iOS install hint | - |

## Phase 2 (flagged) and Phase 3 (off)

As in the brief. Order inside Phase 2: bookings → budget → plan-my-day (rule-based first, AI optional) → overview → map sheet → stats/stamps → votes → ICS → backup/export. Phase 3 only if everything above is green by 25/10.

## Migrations (proposed only, each with a down file)

- `00039_feature_flags.sql` - only if a remote kill switch is wanted.
- `00040_bookings_import_fields.sql` - `source text default 'manual'`, `confidence jsonb`, `attachment_ids uuid[]`. Existing `confirmation_code`, `cost`, `currency`, `status` are reused, not duplicated.
- `00041_idea_votes.sql` - `(idea_id, member_id) unique`, RLS: family members only, guests none.
- `00042_expenses_receipt.sql` - `receipt_asset_id`, `source`, `fx_rate`, `fx_rate_date`.

None is needed for Phase 0 or Phase 1.

## Risks

1. **Live app, 27 days out.** Mitigation: flags, no destructive migrations, Phase 1 shipped in small reviewable PRs, rollback documented.
2. **Global CSS changes (tokens, type floor, tap targets) touch every screen.** Mitigation: screenshot diff on the top routes before/after, done in Phase 0 while there is time to fix.
3. **Auto-downloading documents** increases device storage and keeps passports on every owner device. Copies stay AES-GCM wrapped; kids and guests never download (RLS already blocks them).
4. **No backend in this environment.** E2E runs against the no-auth shell; data-driven flows need `playwright.auth.config.ts` with real env on your machine or Vercel preview.
5. **Scope.** Phase 0 + 1 is about 22 tasks in 16 days. Phase 2/3 will likely not all make the freeze; they stay off.
