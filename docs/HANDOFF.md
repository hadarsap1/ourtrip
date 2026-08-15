# OurTrip — Handoff

Everything needed to pick this project up cold: what exists, how to run it, what
it depends on, what to do when something breaks during the trip, and what is
still open.

Written in English like the rest of `docs/` (the **UI** is Hebrew — see CLAUDE.md
rule #4; `docs/DEV-PLAN-HE.md` and `README.md` are the Hebrew-language docs).

Last updated: **2026-08-15**.

---

## 1. Status in one paragraph

All eight sprints in `docs/ROADMAP.md` are built, deployed and verified,
including the Sprint 8 security criterion (full role-access matrix, live, logged
at the end of `docs/SECURITY-CHECKS.md`). Since then the app has kept growing
past the roadmap: saved links, kid-shared documents behind a Documents PIN,
memory-book export, Google Photos import via the Picker API, flight/hotel search
via RapidAPI, itinerary import from Excel/CSV/Google Sheets with a calendar
view, emergency-page autofill, and a "Paper · Sea · Sun" design system with an
e2e suite and CI. The app is feature-complete for departure; what remains is
real-data entry, the family dry-run, and trip-time operations.

### What is actually in the database (read live, 2026-08-15)

The code is finished; the data is not. This is the real gap before departure.

| | Count | |
|---|---|---|
| Trip | 1 | ⚠️ `start_date` **and** `end_date` are NULL |
| Owners / kids / guests | 2 / 2 / 0 | no guests invited yet |
| Itinerary days | 6, across 5 countries | 27 items on them |
| Bookings | 0 | nothing imported or entered |
| Expenses | 1 | a test row |
| Documents / photos | 0 / 0 | every media bucket is empty |
| Checklists | 0 | the seed's dry-run template not instantiated |
| Emergency pages | 5 | one per country ✅ |
| Phrasebook entries | 47 | ✅ |
| FX rates | 5,115 rows, current to today | ✅ pipeline healthy |
| Push subscriptions | 0 | nobody has enabled notifications |
| Registered kid devices | 0 | tablet never bound |

Infrastructure, by contrast, is running clean: all three cron jobs active with
**zero** failed runs in their history, the weekly backup has produced 5 files
(newest 2026-08-09, 336 kB total), and FX has today's rates from
open.er-api.com.

**Set `trips.start_date` / `trips.end_date` first.** They are NULL, and the
budget projection, the flight check-in reminder and the "day N of the trip"
framing all key off them. Nothing in the repo records the real dates.

---

## 2. Quick start (local)

```bash
npm install
cp env.example .env.local   # fill in the five NEXT_PUBLIC_* values — see §4
npm run dev                 # http://localhost:3000
```

With **no** Supabase env vars set, `components/AuthGate.tsx` bypasses auth and
the full Hebrew RTL shell still renders — that is deliberate, and it is what the
smoke e2e suite relies on. You can browse every screen offline-of-Supabase, you
just get no data.

Checks (the same three CI runs, `.github/workflows/ci.yml`):

```bash
npm run lint
npm test          # vitest unit tests
npm run build
npm run test:e2e  # Playwright smoke, no credentials needed
```

---

## 3. Architecture in one screen

```
Next.js 16 App Router (RTL, Hebrew)          Vercel
  app/*/page.tsx        21 routes, thin — each mounts one component
  components/<area>/    all the real UI
  lib/strings.ts        EVERY user-facing string (731 lines, one object)
  lib/data/*.ts         the only place that talks to Supabase
  lib/offline/*.ts      IndexedDB stores + pending-writes queue
  public/sw.js          app-shell cache, network-first navigations
        │
        ▼
Supabase                                     project ref in migrations
  Postgres + RLS        29 tables, deny-by-default, 18 migrations
  Storage               6 private buckets
  Realtime              itinerary, bookings, checklists, messages
  Edge Functions        12, Deno
  pg_cron + pg_net      3 scheduled jobs
```

**The layering rule that matters:** components never call Supabase directly.
Everything goes through `lib/data/*.ts`, and every user-visible string comes from
`lib/strings.ts`. Both rules are currently held 100% — keep them.

### Routes → screens

| Route | Screen | Who |
|---|---|---|
| `/` | Today (owner + kid variants) | owner, kid |
| `/itinerary` | Itinerary, bookings, calendar, import, travel search | owner |
| `/budget` | Budget dashboard, expenses, converter | owner |
| `/documents` | Documents vault (PIN-locked) | owner (+ kid for shared docs) |
| `/more` | Menu hub → everything below | all |
| `/map` `/phrasebook` `/links` `/recommend` | Field tools | owner (phrasebook also kid) |
| `/journal` `/photos` `/memory-book` `/messages` | Memories + family wall | owner, kid, guest (wall/shared) |
| `/checklists` `/pocket` `/kids` `/guests` `/notifications` | Household + admin | owner (pocket also kid) |
| `/emergency` | Per-country emergency page, one tap from anywhere | all, offline |
| `/login` `/kid-login` | Google OAuth / kid PIN | — |

### Data layer

One file per domain in `lib/data/` (`itinerary.ts`, `expenses.ts`, `photos.ts`,
`kids.ts`, `guests.ts`, …). They own the queries, the realtime subscriptions,
and the offline fallbacks. Unit tests sit next to the pure ones
(`expenses.test.ts`, `links.test.ts`, `format.test.ts`, `importFile.test.ts`,
`importItinerary.test.ts`, `parseExpenseLines.test.ts`, `docCrypto.test.ts`,
`recommendCategories.test.ts`).

### Offline

`lib/offline/db.ts` defines the IndexedDB stores: `documents_offline`,
`today_itinerary`, `emergency_pages`, `phrasebook`, `pending_writes`.
`lib/offline/queue.ts` replays queued writes on reconnect (currently expenses);
`components/OfflineSync.tsx` drives it and `components/OfflineBanner.tsx` shows
the Hebrew banner. The offline-critical set is locked by DECISIONS #9:
flagged documents, today's itinerary, the emergency page, the phrasebook.

---

## 4. Environment variables

`env.example` (no leading dot — `.gitignore` excludes `.env*`) is the template:
`cp env.example .env.local`. It holds only the client-side values; the table
below is the full picture including the server-side secrets, which never go in
that file.

### Vercel (build + client)

| Var | Used by | Missing ⇒ |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabase.ts` | auth bypassed, no data |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `lib/supabase.ts` | same |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | `lib/places.ts`, `lib/data/map.ts` | no map, no Places autocomplete |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | `lib/gphotos/picker.ts` | Google Photos import can't start |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | `lib/push.ts` | push subscribe throws `missing_vapid_key` |

`NEXT_PUBLIC_*` values ship to the browser by definition — only keys that are
safe there belong in this table. Restrict the Maps key by HTTP referrer in the
Google console.

### Supabase Edge Function secrets (`supabase secrets set …`)

| Secret | Used by | Missing ⇒ |
|---|---|---|
| `ANTHROPIC_API_KEY` | `phrasebook-generate`, `recommend`, `emergency-autofill` | Hebrew "service not configured" message, no crash |
| `GOOGLE_MAPS_API_KEY` | `recommend` (server-side Places) | falls back to keyless OpenStreetMap/Overpass |
| `RAPIDAPI_KEY` | `travel-search` | search tab shows "not configured"; rest of itinerary fine |
| `RESEND_API_KEY`, `RESEND_FROM` | `guest-invite` | magic link is returned to the owner UI to share manually (by design) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | `push-send` | no push delivered |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected
into Edge Functions by the platform — do not set them by hand, and never expose
the service-role key to the client.

Every optional integration degrades to a Hebrew "not configured" message rather
than breaking its screen. That pattern is intentional; preserve it.

---

## 5. Database

### Migrations

18 files in `supabase/migrations/`, applied in order.
`00001_initial_schema.sql` is the whole Sprint-1 world (types, 23 tables,
triggers, RLS helpers, owner policies); later files add kids (`00007`), guests
(`00008`/`00009`), push + backups (`00010`), and the post-roadmap features
(`00013`–`00018`). **Never mutate the remote DB by hand** — every change is a new
numbered migration (CLAUDE.md).

### RLS model

Deny-by-default on all 29 public tables. Policies are expressed through SQL
helpers, so a policy reads like a sentence:

| Helper | Answers |
|---|---|
| `current_member_id()` | which member row is this caller (auth user **or** kid JWT) |
| `current_member_role()` | `owner` / `kid` / `guest` / null |
| `is_owner_of(trip_id)` | full access |
| `is_kid_of(trip_id)` | kid-scoped access |
| `is_active_guest_of(trip_id)` | guest, not revoked |
| `document_shared_with_current_kid(path)` | storage gate for kid-shared docs |
| `day_has_guest_visible_item(day_id)` | guest map filtering |

Enforcement triggers (these are the teeth — the UI is only cosmetic):

- `photos_enforce_kid_rules()` — kid uploads are forced to `pending`
  server-side, whatever the client sends.
- `photos_guard_update()` — a client cannot flip `status`/`shared_with_guests`
  itself. **Both** `status='approved'` and `shared_with_guests=true` are required
  before any guest-visible query returns a photo (DECISIONS #4/#5, CLAUDE.md #3).
- `journal_guard_kid()` — kids only touch their own entries.
- `set_updated_at()` — last-write-wins conflict policy needs it everywhere
  (DECISIONS #10).

### Storage buckets (all private)

`documents`, `photos`, `gphotos`, `map-photos`, `booking-files`, `backups`.
Guests never read a bucket directly — `guest-photos` and `guest-gphotos` list
what the *caller's own* RLS allows and then mint short-lived signed URLs with the
service role. Keep that shape for any new guest-visible media.

### Scheduled jobs (pg_cron → pg_net → Edge Function)

| Job | Schedule (UTC) | Function |
|---|---|---|
| `fx-daily` | `30 4 * * *` | `fx-daily` |
| `push-daily` | `0 5 * * *` | `push-send` (rain alert + flight check-in 24h) |
| `backup-weekly` | `0 3 * * 0` | `backup-weekly` → JSON snapshot into `backups` |

All three job bodies call `public.functions_base_url()` (migration `00019`)
rather than a hardcoded URL, and they resolve it on each firing. To repoint them
at another project, no migration and no redeploy:

```sql
alter database postgres
  set app.settings.functions_base_url = 'https://<ref>.supabase.co/functions/v1';
```

Note that `cron.job_run_details.status = 'succeeded'` only means the SQL ran —
`net.http_post` queues the request, so the job "succeeds" even if the HTTP call
fails. To check a job really worked, look at the effect (a fresh `fx_rates` row,
a new file in `backups`) or join `net._http_response` on the request id.

### Seeding a fresh project

`supabase/seed.sql.example` → copy to `seed.sql`, fill in the two real owner
emails, run once with the service role. It creates the trip, the owner members,
the eight budget categories (including `prep`) and the pre-departure family
dry-run checklist template. **Real emails live only in the seed/env, never in
committed code.**

---

## 6. Edge Functions (12)

| Function | JWT | Gate | Notes |
|---|---|---|---|
| `kid-auth` | `false` | one-time code / device token / PIN | pre-auth by nature; 5 wrong PINs ⇒ 15 min lock in `kid_devices` |
| `fx-daily` | `false` | none (cron) | idempotent upsert; open.er-api.com → Frankfurter → last-known |
| `push-send` | `false` | none (cron + triggers) | loads all content server-side from ids |
| `backup-weekly` | `false` | none (cron) | service-role only, returns no data |
| `phrasebook-generate` | `true` | owner re-checked in-function | Claude, forced tool-use for structured output |
| `recommend` | `true` | owner | grounded in real POIs (Places, else Overpass) — never invents names |
| `emergency-autofill` | `true` | owner | curated resident-embassy list; only fills empty generic fields |
| `travel-search` | `true` | owner | proxies two RapidAPI services; key never reaches the client |
| `gphotos` | `true` | owner | Google Picker API; access token used transiently, never stored |
| `guest-invite` | `true` | owner | allowlist + magic link, Resend optional |
| `guest-photos` | `true` | caller RLS | signed URLs for approved+shared only |
| `guest-gphotos` | `true` | caller RLS | same shape for Google Photos |

The three `verify_jwt=false` cron functions are an accepted, documented risk:
anonymous invocation can at most re-run harmless idempotent work
(`docs/SECURITY-CHECKS.md`). The Claude-backed functions all pin
`claude-haiku-4-5-20251001`.

`supabase/config.toml` pins every function's `verify_jwt` so a redeploy from a
clean checkout cannot flip the four unauthenticated-by-design ones back to the
default and silently break FX, push, backups and the kid login. The committed
values were read back from the live project on 2026-08-15 and match it exactly.

One extra function is deployed that is **not** in the repo: `recommend-diag`,
left over from debugging the recommendations function. It is inert — no AI call,
no data access, returns `410` — and stays only because this toolset has no
delete-function API. Delete it from the dashboard when convenient.

---

## 7. The four invariants

If a change would break one of these, it is the wrong change. Everything else is
negotiable.

1. **Security lives in the database.** Every table has RLS; the UI's role checks
   are cosmetic. A new feature PR states which policies cover it.
2. **Three roles only** — owner, kid, guest. Kids and guests never read
   documents, budget or unshared content, verified at policy level.
3. **Kid photos: approval *and* sharing are separate gates.** `approved` +
   `shared_with_guests` both required, trigger-enforced, no config flag to
   disable.
4. **Hebrew RTL, mobile-first, strings in `lib/strings.ts`.** 390px viewport,
   DD/MM/YYYY, ₪. Nothing assumes a single destination country, currency or
   language (DECISIONS #16).

Verification log: `docs/SECURITY-CHECKS.md` — append to it, never rewrite it.

---

## 8. Trip-time runbook

Things most likely to need attention while actually travelling.

**Nothing loads / everything is stale.** Check the offline banner first. The
offline-critical set (flagged documents, today's itinerary, emergency page,
phrasebook) works with the network fully disabled. Everything else is expected to
degrade. Expenses added offline queue in `pending_writes` and replay on
reconnect — they are not lost.

**Currency conversions look wrong.** `fx-daily` runs 04:30 UTC. Check today's
row in `fx_rates`. Fallback chain is open.er-api.com → Frankfurter → last known
rate, so a stale-but-plausible number means the fetch failed rather than the math.
Re-invoke the function manually; expenses store the original currency, so
conversions can be recomputed later.

**No push notifications.** iOS delivers Web Push only to a PWA installed on the
home screen (iOS 16.4+) — `/notifications` has the Hebrew install instructions.
Then check the VAPID secrets and the `push_subscriptions` rows for that device.

**Kid tablet locked out.** Five wrong PINs lock the device for 15 minutes
(`kid_devices.locked_until`). An owner can re-register the tablet from `/kids`:
generate a fresh one-time code, which mints a new device token and revokes the
previous device.

**Guest can't get in.** Their email must be in `guests_allowlist` with
`revoked_at` null. A forwarded magic link opened with a different email is
rejected by design. Without `RESEND_API_KEY` the invite screen hands the owner
the link to send over WhatsApp — that is the intended fallback, not a bug.
Revoking a guest takes effect immediately.

**Check the backups.** A timestamped JSON file should appear in the `backups`
bucket every Sunday 03:00 UTC. It is a structured-data snapshot only; Storage
objects (photos, documents, booking files) rely on Supabase bucket durability and
are **not** re-exported. Worth an occasional manual look at the bucket.

**Recommendations or phrasebook say "not configured".** `ANTHROPIC_API_KEY` is
missing from the Edge Function secrets. Everything else keeps working.

---

## 9. Open items

Ordered by what actually gates departure.

1. **Set the trip dates.** `trips.start_date` / `trips.end_date` are NULL (§1).
   Everything date-derived is degraded until they are filled in.
2. **Load the real trip.** 6 days, 0 bookings, 0 documents. The itinerary
   importer (Excel / CSV / Google Sheets, `/itinerary`) exists precisely for
   this, and re-imports de-duplicate, so it is safe to run repeatedly as the
   plan firms up.
3. **The family dry-run.** The seed ships a full-day dry-run checklist template
   (`docs/ROADMAP.md` Sprint 8) — not yet instantiated. Run it end-to-end on the
   two phones plus the tablet: it is the last acceptance criterion that a human,
   not a test, has to sign off, and it is what will surface the real problems.
4. **Bind the kid tablet and enable push.** 0 registered devices, 0 push
   subscriptions — neither flow has been exercised outside development.
   iOS needs the PWA installed to the home screen first.
5. **Reorder the `gphotos` role check before input validation** so a malformed
   non-owner call gets `403`, not `400`. Not a leak — noted in SECURITY-CHECKS.
6. **Delete the `recommend-diag` function** from the dashboard (§6). Inert, but
   it is repo/production drift.
7. **Storage backups.** Decide whether photos/documents deserve their own export
   or an explicit "Supabase bucket durability is enough" decision. Today the
   weekly backup covers structured data only.
8. **`npm audit` will keep reporting `xlsx`.** Prototype pollution + ReDoS with
   no npm fix available. Assessed and accepted: it parses only in the browser,
   only on owner screens, on files the owner picks. Do **not** "fix" it by moving
   the import server-side — that runs the same unpatched library next to the
   service role. Full reasoning and the two real mitigations are in
   `docs/SECURITY-CHECKS.md` (2026-08-15).
9. **Backlog, explicitly not built:** email-forward booking extraction, live
   flight tracking, multi-trip UI (DECISIONS #8). The memory book, once out of
   scope, now exists at `/memory-book`.

Closed on 2026-08-15: the missing env template (`env.example`), the unpinned
`verify_jwt` settings (`supabase/config.toml`), and the hardcoded project URL in
the cron jobs (migration `00019`).

---

## 10. Conventions for whoever works on this next

- Read `CLAUDE.md` first — it overrides habit. Then `docs/DECISIONS.md`: those
  are closed. If implementation reveals a real blocker, raise it; don't silently
  deviate.
- The stack is locked. Don't add a dependency without stating why; prefer the
  platform (Supabase, browser APIs) over a new library.
- New UI string → `lib/strings.ts`. New query → `lib/data/`. New schema → a new
  numbered migration. New security-relevant behaviour → a row appended to
  `docs/SECURITY-CHECKS.md`.
- Definition of done (CLAUDE.md): mobile RTL Hebrew, RLS verified with the wrong
  role, realtime checked across two sessions where relevant, offline behaviour
  defined, clean lint/build.
- The roadmap is finished, so the old `sprint-N:` commit style has given way to
  conventional commits (`feat(area):`, `fix(area):`, `docs(...)`). Match the
  recent history.
