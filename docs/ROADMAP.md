# OurTrip - Sprint Roadmap (8 weeks)

Work one sprint at a time. A sprint is done only when every acceptance criterion passes and `npm run build` is clean. Deploy to Vercel at the end of every sprint.

Timeline note: departure is ~100 days from kickoff (2026-07-16), so 8 weekly sprints finish with roughly a 5-week buffer. Protect that buffer — do not let sprints slip silently.

## Sprint 1 - Foundation
Build: Next.js project (App Router, TS strict, Tailwind RTL), Supabase project wiring, full schema migration from `docs/SCHEMA.sql` with RLS enabled on every table (including the `current_member()` helper designed for both owner auth and future kid JWTs), Google OAuth for the two owner emails, Hebrew RTL app shell with bottom tab nav (היום / מסלול / תקציב / מסמכים / עוד), empty Today screen, PWA manifest + basic service worker (app shell cache), deploy to Vercel.
Acceptance:
- [ ] Both owner emails can log in; any other Google account is rejected with a Hebrew error page
- [ ] All tables exist, RLS enabled, anonymous access to every table returns zero rows
- [ ] App installs as PWA on Android and iOS, RTL layout correct
- [ ] Deployed and reachable on a Vercel URL

## Sprint 2 - Itinerary + Bookings + Realtime
Build: itinerary days/items full CRUD (days carry `country_code`), drag reorder, move-item-to-day flow, status changes; bookings CRUD with type-specific fields, file attach to Storage, link booking↔day; Supabase Realtime on itinerary and bookings; Google Places autocomplete for locations.
Acceptance:
- [ ] Editing an item on device A appears on device B within 2 seconds without refresh
- [ ] Moving an item to another day takes ≤ 2 taps
- [ ] A booking PDF can be attached and reopened
- [ ] Creating a booking with a cost offers to create a linked expense

## Sprint 3 - Budget + FX + Checklists
Build: categories seeded with Hebrew labels, planned amounts editable; fast expense entry (amount → currency → category); daily FX fetch (open.er-api.com / exchangerate.host primary, Frankfurter fallback) into `fx_rates` with fallback to last known rate; budget dashboard (totals, bars, burn rate, projection); converter widget; checklists + templates with realtime check-off.
Acceptance:
- [ ] Expense entry in ≤ 3 taps with keyboard appearing pre-focused on amount
- [ ] Expense in EUR shows correct ILS conversion at that day's rate
- [ ] Expense in a non-ECB currency (e.g. THB, VND) shows correct ILS conversion
- [ ] Dashboard projection = spent + (daily burn × remaining days)
- [ ] Checking an item on device A updates device B live

## Sprint 4 - Documents + Offline core + Emergency
Build: documents vault (upload, tags, search, signed URLs); offline toggle per document → IndexedDB cache; offline infrastructure (IndexedDB stores, pending-writes queue, replay on reconnect, offline banner); emergency pages (per-country structured editor for owners, one-tap access icon, offline, defaults to current day's country); today's itinerary cached offline.
Acceptance:
- [ ] With network disabled: offline-flagged documents open, emergency page opens (all countries), today's itinerary renders
- [ ] An expense added offline syncs when back online
- [ ] Kid/guest roles cannot query documents (verified with direct API attempt, logged in SECURITY-CHECKS.md)

## Sprint 5 - Maps + Weather + Field tools
Build: Google Maps screen (day-colored pins, custom pins, saved routes in `routes`); daily static snapshot of today's map area cached; Google Maps deep links; Open-Meteo integration per day (cached), weather in Today + timeline, rain alert on outdoor items; Where's the car (save pin + photo, navigate back); phrasebook (generate per destination language via Anthropic Edge Function, store, offline, "show to local" mode).
Acceptance:
- [ ] Today view shows itinerary + weather + mini-map together
- [ ] Car pin saved and navigable in 1 tap each
- [ ] Phrasebook opens with network disabled, and switching language works offline for already-generated languages
- [ ] Rain > 50% on an outdoor-item day shows an in-app alert

## Sprint 6 - Kids experience
Build: kid device registration flow (owner generates, tablet binds, PIN unlock via Edge Function-minted JWT, rate-limited); kid home screen variant; journal (text + mood + photo, daily prompt); photo upload with client-side compression → pending queue; owner approval queue UI + explicit share-with-guests toggle; pocket money (owner sets allowance, kid logs, progress visual).
Acceptance:
- [ ] Kid session cannot access budget/documents/bookings (API-level check, logged)
- [ ] Kid-uploaded photo is invisible to guests until approved AND shared - verified even if the client sends status='approved' or shared_with_guests=true (trigger enforces)
- [ ] PIN unlock works after tablet restart; 5 wrong PINs locks the device profile temporarily
- [ ] Journal entry auto-tags date + location

## Sprint 7 - Guests portal + Messages
Build: guest invitation (owner adds email → magic link sent via custom SMTP, e.g. Resend), allowlist enforcement incl. `revoked_at`; guest portal (approved+shared photos by day, shared journal, where-we've-been map of done+shared items, family wall composer); family wall for kids with unread badges (`message_reads`); owner visibility of all messages.
Acceptance:
- [ ] Magic link opened with a non-allowlisted email is rejected
- [ ] Guest sees only: approved+shared photos, shared journal entries, done+shared itinerary on map - nothing else exists in any API response
- [ ] Guest message appears on kid tablet in realtime; kid reply reaches guest portal
- [ ] Revoking a guest removes access immediately

## Sprint 8 - Recommendations + Notifications + Hardening
Build: "מה בסביבה" (Edge Function: Anthropic + Places, Hebrew results, kid-friendly bias, save-to-itinerary/maybe-list); Web Push (weather alert, check-in reminder 24h before flight, new family wall message, pending-photo alert for owners) + iOS install-instructions screen; security pass (cross-role access matrix test, expired-link test, storage bucket policy audit - all logged in SECURITY-CHECKS.md); weekly backup Edge Function; full-day family dry-run checklist; bug buffer.
Acceptance:
- [ ] Full role-access matrix documented with pass/fail in SECURITY-CHECKS.md, all pass
- [ ] Push notification received on an installed PWA (Android verified; iOS verified installed-only)
- [ ] Recommendation saved into the itinerary in one tap
- [ ] Backup file appears in the backup bucket after scheduled run

Cut order if sprint 8 overruns: notifications first, recommendations second. Security checks and backups are never cut.

## Backlog (post-launch / during trip)
- Email-forward booking extraction (Edge Function + Anthropic parsing)
- Memory book PDF export
- Share a specific document with kids (e.g. boarding pass)
