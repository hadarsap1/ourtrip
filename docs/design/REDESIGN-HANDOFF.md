# OurTrip redesign v2 - handoff

Design canvas (owner access): https://claude.ai/artifact/Q5EC3CPafHhDcpCFgo3MYx
Pages: **A** design system (tokens, components, navigation), **B** all screens at 390×844 with states, **C** full build spec.

Tokens live next to this file: `tokens.css` (copy into `app/globals.css`) and `tokens.json` (same values, structured).

> This is a design proposal, not a sprint. Per `CLAUDE.md`, implement it only when a roadmap sprint calls for it, and keep every hard rule (RLS, roles, photo approval, Hebrew strings in `lib/strings.ts`).

## What changes

- Keeps cream, teal, white rounded cards and thin borders.
- Adds a color per country (always with flag + 2-letter code), one category palette shared by map pins, timeline nodes and budget rings, a single 40px hero number per screen, a timeline spine with type icons, a bottom sheet over the map, and a capture FAB.
- Text floor is 12px (the current app has about 108 text nodes at 10-11px). Inputs are 16px.
- Gold for labels moves from about `#B8862B` (about 3:1 on cream, fails AA) to `#8A6114`. The old gold stays as a decorative stroke only.

## Navigation

Option A: five tabs (היום, מסלול, תקציב, מסמכים, עוד) plus a 56px FAB centered 12px above the bar. FAB opens הוצאה / פתק / תמונה / סריקה, so capture is two taps from any tab. The FAB hides while the keyboard is open, a sheet is at full height, on the PIN screen and in the camera.

Note: commit #75 made `main` the only scroller and removed `position: fixed` from the bottom bar. Keep that structure; the FAB sits in the same bottom stack.

## Components

| Component | Variants | States | Size | Tokens |
|---|---|---|---|---|
| Button | primary, secondary, ghost, destructive | default, pressed, disabled, loading, offline | h48, min-w 132, r-md | brand, brand-contrast, brand-pressed, danger, surface-2 |
| IconButton | outline, ghost, filled, badge | default, pressed, disabled, done (1.5s) | 44×44, icon 22 | surface, border, brand-soft |
| Chip / FilterChip | plain, filter, count | off, on, disabled | h36 visual, 44 hit, r-full | surface, border, brand-soft |
| StatusTag | success, warning, danger, info, neutral | - | h24, caption 600, r-sm | *-soft + base |
| CountryChip | soft, solid | default, selected | h32 / h44, flag 20 | country-x-soft, country-x, country-x-on |
| CountdownChip | urgent (≤30 days, solid), later (soft) | - | h24 | danger, danger-soft, danger-contrast |
| TransitChip | walk, bus, taxi, train, flight | - | h24-28, dashed | border, text-muted |
| ProgressBar | brand, country | determinate, pending sync | h6 / h8 | surface-2, country-x |
| Ring | 40, 64, 72, 88 | static, fill-in 350ms | stroke 7-8 | brand, cat-x |
| Stepper | nights | default, at minimum, offline queued | 44 + value + 44 | surface, border |
| ListRow | icon tile, chevron, swipe | default, pressed, swiping | min-h 56/64 | surface, surface-2 |
| Card / Tile | default, highlighted, dashed empty group | - | r-lg, p16 | surface, border, e1 |
| TimelineItem | past, now, next, transit | checked off | grid 40-44 / 32-36 / 1fr | cat-x, cat-x soft |
| FlightCard | compact, detail | on time, delayed, cancelled, offline | times 32/36, detail 40/44 | cat-flight, status tags |
| BottomSheet | peek, half, full | dragging, scrim at full | r-xl top, grabber 32×4 | surface, e3, scrim |
| Toast | info, undo, success | in/out 250ms | min-h 52, action h44 | text (bg), bg (fg) |
| Skeleton, EmptyState | - | max one shimmer per screen | - | surface-2, brand-soft |
| SegmentedControl, SearchField, FormField, DatePickerRow | - | default, focus, error, disabled, low-confidence | h48 (track 48 / seg 40) | border, brand, danger, warning-soft |
| CurrencyChips, NumericKeypad | amount (000 key), PIN | selected, pressed | h44, keys 52 / 80×64 | brand-soft, surface-2 |
| BottomNav + FAB | 5 tabs | active, FAB open | 56 + safe area, FAB 56 | surface, brand-soft, brand |
| OfflineBanner, SyncIndicator | synced, syncing, pending, failed | - | banner ≥52, caption | warning-soft, info, danger |
| Flag, Icon | rect 3:2 / round; 72 icons | mirror in LTR | 14-72 | currentColor |

Icons: 24 viewBox, stroke `currentColor` 1.75 (2 at 16px and below), round caps. Paths are in the canvas `Icon` artboard. Ship as inline SVG, no new dependency. Direction-aware: `back`, `chev`, `undo`, `nav` (authored for RTL, mirrored in LTR).

## Behavior

- **Bottom sheet:** peek 96px, half 50%, full = viewport minus top inset minus 48. A fling over 0.5px/ms moves one snap. Scrim and scroll lock only at full.
- **Swipe rows:** swipe toward the end edge (left in RTL). 72px reveals both actions. Past 50% of the row width deletes. Undo toast for 5s, one open row at a time.
- **Empty days:** two or more empty days in a row collapse into one dashed card ("22 ימים ללא תוכנית" + "תכנן מהבנק").
- **Offline:** banner "אין חיבור - הנתונים נשמרו במכשיר" plus "סונכרן לאחרונה לפני …". Writes queue in an IndexedDB outbox and the pending count shows in the sync indicator. Features that need the network (plan my day, camera translate, assistant, paste parsing, rate refresh) show their own offline state with a manual path.
- **Skeletons:** only on first load with an empty cache. With cache, render at once and sync silently.
- **Numbers:** `Intl.NumberFormat('he-IL')`, `₪412`, 24h times, DD/MM/YYYY, every number, code and Latin name wrapped in `<bdi>`.
- **Charts in RTL:** today sits at the start (left) end of the sparkline. Rings run clockwise from 12 o'clock.
- **Low-confidence fields** (import, receipt): dashed 2px warning border + one-line reason.
- **Motion:** at most one animated element per screen; reduced motion gives fades only.

## Build order

1. Foundation: tokens, Tailwind mapping, theme switch, Icon, Flag, Button, Chip, Card, Toast, Skeleton, BottomSheet, BottomNav + FAB, OfflineBanner, SyncIndicator, remove all text under 12px
2. Today (pre-trip, in trip, travel day)
3. Itinerary (segment header + stepper, day cards, empty groups, swipe + undo, overview, plan my day)
4. Bookings (tiles, rich cards, detail, paste to import)
5. Budget (hero, rings, country tabs, quick add, receipt review)
6. Documents (PIN, filters, per-file offline state, download all, missing-doc empty state, share)
7. Map (sheet tabs, pins, route, offline download)
8. Journal (feed, composer, stats, stamps, memory book, kids mode, photo approvals)
9. Camera translate
10. Assistant (stretch)

## Do not change

- RLS stays the source of truth; the UI only mirrors it.
- A guest sees a photo only when `photos.status = 'approved'` **and** `photos.shared_with_guests = true`. Approval and sharing stay two separate controls.
- Kids and guests never see documents, budget or unshared content.
- Documents stay behind the PIN, keep the per-file offline flag, and auto-lock.
- Offline-critical: documents vault, today's itinerary, emergency page, phrasebook.
- Emergency, phrasebook and weather are keyed by the current or selected country.
- `dir="rtl"` root, all strings in `lib/strings.ts`, DD/MM/YYYY, ₪.
- The five tab destinations and the desktop side rail (desktop = centered 480px column + rail).
- No existing feature removed (ideas bank, visas, readiness, checklists, pocket money, guests, notifications).

## Open points

- Segment order, dates, budgets and bookings in the mockups are sample data.
- Dark-mode contrast was computed for core pairs only; run axe on the built screens, especially text over photo overlays.
- Emergency numbers shown for Vietnam (113 / 114 / 115) need a check before departure; embassy and insurance numbers are placeholders.
