# OurTrip — Security Checks Log

Every RLS / role-access verification gets logged here (CLAUDE.md definition of done).

## 2026-07-16 — Sprint 1: anonymous access

Environment: Supabase project `xeqfcrxrpfjlqhkijrwd`, migrations `initial_schema` + `function_hardening`.

| Check | Method | Result |
|---|---|---|
| RLS enabled on all 23 public tables | `list_tables` | ✅ PASS |
| Anonymous role sees zero rows in every table, verified against a DB containing probe data (`set local role anon` + per-table counts) | SQL role emulation | ✅ PASS |
| Trigger functions (`set_updated_at`, `photos_enforce_kid_rules`, `photos_guard_update`) not executable via REST RPC | `revoke execute` migration + advisor re-check | ✅ PASS |
| `link_member_to_auth_user` not executable by anon | `revoke execute` migration | ✅ PASS |
| `set_updated_at` search_path locked | migration | ✅ PASS |

Notes:
- `current_member_id` / `current_member_role` / `is_owner_of` intentionally remain executable by anon+authenticated: RLS policy expressions run them as the querying role. For anon they return null/false — no data exposure. Advisor WARNs on these are accepted.
- Probe rows were deleted after the test; DB is empty pending the real seed.
- ~~TODO Sprint 1 wrap-up: re-run the anon check from a real client (REST) once deployed~~ — **done 2026-07-27** (see "Full role-access matrix" at the end of this file): the sandbox still can't reach supabase.co, so the request was issued from the database via `pg_net` against the real REST API with the anon key. `itinerary_days`, `members` and `trips` all returned `200 []` while genuinely holding 6 / 4 / 1 rows.

## 2026-07-16 — Sprint 2: bookings storage + realtime

Environment: migration `sprint2_realtime_storage` applied (repo file `00003_sprint2_realtime_storage.sql`; `00002_function_hardening.sql` recreated in-repo from the remote record — no schema delta).

RLS covering this sprint's features (all pre-existing from Sprint 1, no new table policies needed): `itinerary_days_owner_all`, `itinerary_items_owner_all`, `bookings_owner_all`, `expenses_owner_all`, `budget_categories_owner_all`. New policies: 4 owner-only policies on `storage.objects` for the `booking-files` bucket.

| Check | Method | Result |
|---|---|---|
| `booking-files` bucket is private (`public = false`) | SQL against `storage.buckets` | ✅ PASS |
| Probe object in `booking-files` invisible to `anon` (0 rows) | SQL role emulation (`set local role anon`) | ✅ PASS |
| Probe object invisible to `authenticated` with no member claim (0 rows) — covers kid/guest of the future auth flavors, since `current_member_role()` resolves to null | SQL role emulation (`set local role authenticated`) | ✅ PASS |
| Exactly 4 `booking_files_*` policies exist on `storage.objects` (select/insert/update/delete, all owner-only) | `pg_policies` | ✅ PASS |
| Realtime publication limited to `bookings`, `itinerary_days`, `itinerary_items` — subscribers are authorized against those tables' RLS | `pg_publication_tables` | ✅ PASS |

Notes:
- Probe row deleted after the test (via the storage guard's `storage.allow_delete_query` escape hatch; the row had no backing file, so nothing orphaned).
- File opening in the app goes through `createSignedUrl`, which itself requires passing the SELECT policy — no public URLs anywhere.

## 2026-07-16 — Sprint 3: budget + FX + checklists

Environment: migration `sprint3_checklists_realtime_fx_cron` applied (repo file `00004_...`), Edge Function `fx-daily` v1 deployed.

RLS covering this sprint's features (all pre-existing from Sprint 1, no new policies): `budget_categories_owner_all`, `expenses_owner_all`, `checklists_owner_all`, `checklist_items_owner_all`, `fx_rates_member_select`.

| Check | Method | Result |
|---|---|---|
| `fx_rates` INSERT as `authenticated` rejected (only SELECT policy exists; writes are service-role only) | SQL role emulation → `42501` RLS violation, no row landed | ✅ PASS |
| `fx-daily` writes via service role only; scheduled cron job active | `cron.job` (`fx-daily`, 04:30 UTC daily, active=true) | ✅ PASS |
| Realtime publication limited to exactly: `bookings`, `checklist_items`, `checklists`, `itinerary_days`, `itinerary_items` | `pg_publication_tables` | ✅ PASS |
| FX correctness: 165 currencies seeded for 2026-07-16 incl. non-ECB (EUR ₪3.431591, THB ₪0.089259, VND ₪0.000114) | invoked function via `pg_net`, inspected `fx_rates` | ✅ PASS |

Notes:
- **Accepted risk**: `fx-daily` is deployed with `verify_jwt=false` so pg_cron can invoke it without embedding a key in SQL. The function takes no input, only upserts today's public FX rates (idempotent), and exposes no data — worst case an anonymous caller triggers a redundant refresh. Revisit in the Sprint 8 security pass.
- Client FX lookups read `fx_rates` (that day's rate) first, then live providers, then last known rate — clients never write rates (RLS enforced, verified above).

## 2026-07-16 — Sprint 4: documents vault + kid-role denial

Environment: migration `sprint4_documents_bucket` applied (repo file `00005_...`).

RLS covering this sprint's features: `documents_owner_all` (pre-existing, 00001) + 4 new owner-only `documents_*` policies on `storage.objects` for the `documents` bucket.

Kid-role check ran with a probe kid member resolved through the REAL auth path kid devices will use from Sprint 6 (`authenticated` role + JWT `member_id` claim → `current_member_id()`), against a DB containing a probe document + storage object:

| Check | Method | Result |
|---|---|---|
| Kid identity resolves (`current_member_role()` = 'kid') — the denial below is a policy denial, not an auth failure | SQL role emulation + `request.jwt.claims` | ✅ PASS |
| Kid sees 0 rows in `documents` (probe row existed) | same session | ✅ PASS |
| Kid sees 0 objects in `documents` storage bucket (probe object existed) | same session | ✅ PASS |
| Kid sees 0 rows in `expenses` / `bookings` (CLAUDE.md rule #2 scope) | same session | ✅ PASS |
| `documents` bucket private, 4 owner-only storage policies | migration + `pg_policies` | ✅ PASS |

Notes:
- Probe rows (document, storage object, kid member) deleted after the test.
- Guest-role documents denial follows from the same structure (no guest policy exists on `documents` → deny-by-default); explicit guest-session check joins the Sprint 7 pass when guest auth exists end-to-end.
- Offline copies of documents live in IndexedDB on the owner's device only, stored after an RLS-authorized signed-URL download; they never bypass server policies.
- AuthGate change: on a *network-failing* role check with a locally stored session, the shell now renders (offline requirement). This is a client-side gate only — every data read/write remains RLS-enforced server-side; a revoked user with a stale session sees empty screens, not data.

## 2026-07-16 — Sprint 5: maps + phrasebook function

Environment: migration `sprint5_map_photos` applied (repo file `00006_...`), Edge Function `phrasebook-generate` v1 deployed (`verify_jwt=true`).

RLS covering this sprint's features (pre-existing from 00001): `map_pins_owner_all`, `routes_owner_all`, `phrasebook_entries_owner_all`. New: 4 owner-only `map_photos_*` policies on `storage.objects`.

| Check | Method | Result |
|---|---|---|
| `phrasebook-generate` with no Authorization header rejected | HTTP probe via `pg_net` → 401 `UNAUTHORIZED_NO_AUTH_HEADER` | ✅ PASS |
| `phrasebook-generate` with a valid JWT that is NOT a member (anon key as bearer) rejected by the function's own owner check | HTTP probe via `pg_net` → 403 `forbidden` | ✅ PASS |
| `map-photos` bucket private, 4 owner-only storage policies | migration | ✅ PASS |

Notes:
- The function's write path runs with the service role only AFTER the caller's own JWT resolves to `role='owner'` via `current_member_role()` — the same RLS helper the policies use. Kids (Sprint 6) will read phrasebook entries but cannot trigger generation.
- `fx-daily` remains the only `verify_jwt=false` function (accepted risk, logged in Sprint 3).
- Weather (Open-Meteo) and Static Maps snapshots contain no personal data; FX/weather caches are device-local.

## 2026-07-17 — Sprint 6: kid role live

Environment: migration `sprint6_kids` applied (repo file `00007_...`), Edge Function `kid-auth` v1 deployed. All checks ran with a probe kid member through the production auth path (`authenticated` + resolved member), probes deleted afterwards.

| Check | Method | Result |
|---|---|---|
| Kid role-access matrix: 0 rows in `budget_categories`, `expenses`, `documents`, `bookings`, and `documents`/`booking-files` storage objects; trip row visible (positive control) | SQL role emulation, kid claims | ✅ PASS |
| Kid INSERT of a photo with client-sent `status='approved'`, `shared_with_guests=true` landed as `pending`/`false`/`approved_by=null` | live insert through kid RLS + `photos_enforce_kid_rules` trigger | ✅ PASS |
| Kid UPDATE trying to flip `status`/`shared_with_guests` on own photo: caption updated, both flags frozen | live update through `photos_guard_update` trigger | ✅ PASS |
| Device registration: one-time code redeemed once (row marked used), previous devices auto-revoked | `kid-auth` register probe → 200 with device token | ✅ PASS |
| PIN rate limiting: wrong PINs count down 4→1, 5th wrong PIN → HTTP 423 with `locked_until` (+15 min); **correct** PIN while locked → still 423 | 6 sequential `kid-auth` unlock probes | ✅ PASS |
| PIN unlock happy path (session minting) | blocked on project auth config: `signInWithPassword` → "Email logins are disabled" | ⚠️ PENDING — enable the Email provider (Authentication → Sign In/Up); signups can stay off (admin API creates kid users). Re-test = bind the real tablet. |

Notes:
- `kid-auth` is deployed `verify_jwt=false` **by design**: register/unlock happen before any JWT exists. Actual auth = one-time registration code (15 min TTL, sha256-stored) + 256-bit device token (sha256-stored; doubles as the kid auth-user password, rotated on every rebind) + PIN (PBKDF2-100k, server-side rate limit). `create-registration` additionally requires an owner JWT in-function.
- Kid auth users (`kid-<member_id>@kids.ourtrip.app`) are created by the service role with confirmed emails; no email is ever sent. A stranger who somehow signed in with email/password would have no `members` row → zero rows everywhere (deny-by-default) and an AuthGate rejection.
- Journal: `journal_before_write` trigger keeps kid writes from ever setting `shared_with_guests` (same rule as photos).
- `photos` bucket: family (owner+kid) select/insert; update/delete owner-only. Guests never read the bucket directly — Sprint 7 serves approved+shared photos via signed URLs only.

## 2026-07-17 — Sprint 7: guest role live

Environment: migrations `sprint7_guests` (00008) + `sprint7_guest_policy_fix` (00009) applied; Edge Functions `guest-invite` + `guest-photos` deployed (`verify_jwt=true`; invite additionally owner-gated in-function). All checks ran with a probe guest against MIXED probe content (shared/unshared/pending variants); probes deleted afterwards.

| Check | Method | Result |
|---|---|---|
| Guest sees exactly: 1 of 3 photos (only approved+shared), 1 of 2 journal entries (only shared), 1 of 2 itinerary items (only done+shared) + its day | SQL role emulation, guest claims | ✅ PASS |
| Guest sees 0 rows in documents, bookings, expenses, budget_categories, checklists, pocket_money, and ALL storage objects | same session | ✅ PASS |
| Revocation immediate: after `revoked_at` set, same guest session sees 0 rows in every table incl. trips and messages | same claims, post-revoke | ✅ PASS |
| Revoked guest cannot write to the wall | INSERT → 42501 RLS violation | ✅ PASS |
| Active guest wall access: message INSERT as self + SELECT feed + member display names | live insert/select | ✅ PASS |
| Realtime publication includes `messages` (kid⇄guest live wall); subscribers authorized via the SELECT policies | `pg_publication_tables` | ✅ PASS |
| **Recursion bug caught & fixed pre-release**: 00008's day↔item guest policies caused `42P17 infinite recursion`, breaking itinerary reads for all roles; 00009 reroutes cross-table checks through SECURITY DEFINER helpers | probe failure → hotfix → matrix re-run green | ✅ FIXED |

Notes:
- Non-allowlisted magic link: links are only ever generated for allowlisted emails (owner-gated function). If a non-allowlisted account signs in anyway, it has no `members` row → AuthGate rejects with the Hebrew error and RLS returns zero rows (deny-by-default; same proof as the Sprint 1/4 checks).
- Guest photo bytes flow only through `guest-photos`: rows are selected under the CALLER's own JWT (RLS decides what exists), service role only signs URLs for those rows.
- `guest-invite` never escalates an existing owner/kid member to guest (email collision check), and re-inviting clears `revoked_at` intentionally (documented owner action).

## 2026-07-18 — Sprint 8: recommendations + notifications + hardening

Environment: migrations `sprint8_push_backup` (repo `00010_...`) + `sprint8_recommendations` (repo `00011_...`) applied; Edge Functions `push-send`, `backup-weekly` (both `verify_jwt=false`) and `recommend` (`verify_jwt=true`, owner-gated in-function) deployed. New tables: `push_subscriptions`, `saved_recommendations`. New bucket: `backups` (private). Cron: `push-daily` (05:00 UTC), `backup-weekly` (Sun 03:00 UTC).

New RLS: `push_subscriptions_self_all` (self only), `saved_recommendations_owner_all` (owner only), `backups_owner_select` on `storage.objects` (owner-only read; no client write policy → service-role writes only). All checks ran with probe rows through the production auth path (`authenticated` + resolved `member_id` claim; anon via `set local role anon`), each inside a transaction rolled back afterwards — no probes persist.

Sprint 8 role-access matrix (new surfaces):

| Role | `saved_recommendations` | `push_subscriptions` | `backups` storage | Result |
|---|---|---|---|---|
| owner | sees rows (1 probe) | sees **own** only (owner's 1, not kid's) | sees objects (1 real backup) | ✅ PASS |
| kid | **0** | sees **own** only (1), owner's row **0** | **0** | ✅ PASS |
| guest | **0** | **0** | **0** | ✅ PASS |
| anon | **0** | **0** | **0** | ✅ PASS |

| Check | Method | Result |
|---|---|---|
| Kid cannot register a push subscription under another member's `member_id` (WITH CHECK) | live insert as kid with owner's `member_id` → `42501` RLS violation, no row | ✅ PASS |
| `recommend` rejects a non-owner caller | in-function `current_member_role()` gate → 403 `forbidden` (same pattern proven for `phrasebook-generate` in Sprint 5) | ✅ PASS |
| Weekly backup writes to the private bucket | invoked `backup-weekly` via `pg_net`; `backup-2026-07-18-06-07-50.json` (32 KB, 26 tables) appeared in `backups` | ✅ PASS |
| No new RLS gaps | `get_advisors(security)` — neither new table flagged (RLS enabled + policies present); only the pre-existing accepted `SECURITY DEFINER` helper WARNs (Sprint 1) + standard `pg_net`/auth items remain | ✅ PASS |

Cumulative deny-by-default for the core sensitive tables (`documents`, `bookings`, `expenses`, `budget_categories`, `pocket_money`, `checklists`) against kid/guest/anon was proven in the Sprint 4/6/7 logs and is unchanged by this sprint (no policy on those tables was touched).

Notes:
- **Accepted risk (revisited from Sprint 3)**: `push-send` and `backup-weekly` are `verify_jwt=false` so `pg_cron`/`pg_net` and the message/photo AFTER-INSERT triggers can invoke them without embedding a key in SQL. Neither returns data. `backup-weekly` only writes an idempotent-per-second snapshot to a private, owner-only bucket. `push-send` loads all content server-side from the id it is handed and only ever pushes to legitimately-subscribed devices, so a forged call can at most **re-notify real content** to the real recipients — it cannot exfiltrate or target arbitrary endpoints. `recommend` stays owner-gated (`verify_jwt=true` + in-function role check) because it spends the Anthropic key.
- The `messages_notify` / `photos_notify_pending` triggers use `pg_net` fire-and-forget: if `push-send` errors (e.g. VAPID unset), the originating INSERT still commits — messaging/photos never regress on a push failure.
- **⚠️ PENDING — VAPID secrets**: push delivery needs `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` set as `push-send` function secrets, and `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in Vercel env, before any notification is actually sent. Until then `push-send` returns 500 harmlessly. Android install-and-receive + iOS installed-only receive are re-tested on the real devices once keys are set (same "verify on real hardware" posture as the Sprint 6 PIN-unlock item). The install-instructions screen (`/notifications`) covers the iOS 16.4+ home-screen requirement.
- `recommend` degrades gracefully: with no `GOOGLE_MAPS_API_KEY` it returns a Claude-only answer (no `place_id`); with the key it curates real Google Places candidates. Either way results are ephemeral until the owner saves them — the maybe-list (`saved_recommendations`) and the itinerary are the only persisted sinks.

## 2026-07-18 — Post-launch: kid-shared documents + document lock

Environment: migrations `documents_share_with_kids` (repo `00014_...`) + `document_pin` (repo `00015_...`) applied. Two new document-sharing surfaces, both verified with probe rows inside rolled-back transactions.

### B1 — share a specific document with kids
New: `documents.shared_with_kids` flag; `documents_kid_select` policy; SECURITY DEFINER `document_shared_with_current_kid(text)` + `documents_kid_read` storage policy on the `documents` bucket. Kids have **no** INSERT/UPDATE/DELETE policy on `documents` — read-only (CLAUDE.md rule #2).

| Check | Method | Result |
|---|---|---|
| Kid sees only shared documents (1 of 2 probes: a shared boarding pass, not the private passport) | SQL role emulation, kid claims | ✅ PASS |
| Kid storage read authorized for the shared path only (`document_shared_with_current_kid` → true for bp.pdf, false for pp.pdf) | same session | ✅ PASS |
| Kid cannot flip `shared_with_kids` (no write policy → deny-by-default) | policy set | ✅ PASS |

### Document lock — end-to-end encryption (Documents PIN)
New: `documents.pin_protected` + `enc_mime`; `document_pin(trip_id, salt, verifier_iv, verifier_ct)` table with owner-only `document_pin_owner_all` policy. Locked files are AES-GCM encrypted client-side (key = PBKDF2-210k of the family Documents PIN) **before upload** — the `documents` bucket holds only ciphertext; opening decrypts in-browser. `docCrypto` is unit-tested (round-trip, wrong-PIN rejection, verifier).

| Check | Method | Result |
|---|---|---|
| `document_pin` owner-only: owner sees the row (1), kid sees 0 | SQL role emulation | ✅ PASS |
| anon/guest see 0 (deny-by-default, no non-owner policy) | policy set | ✅ PASS |
| Locked documents are never kid-shared (locking clears `shared_with_kids`; share toggle hidden for locked docs) | `protectDocument` + UI | ✅ PASS |

Notes:
- **Threat model**: defeats the "found/lost device" case fully — a locked passport is unreadable online or offline without the PIN, and the server never holds plaintext. **Accepted residual risk**: the salt + verifier are readable by an owner session, so an attacker who steals a live owner session could offline-brute-force a short numeric PIN (PBKDF2-210k slows it, but 6 digits is GPU-crackable). Mitigation: the UI allows 6–12 digit PINs — a longer PIN raises the cost. Inherent to short-PIN E2E, documented for the owner.
- **Forgotten PIN = unrecoverable** by design (owner chose full E2E over recoverability); the set-PIN flow warns and requires acknowledgement.
- `ANTHROPIC_API_KEY` is now configured — `recommend` + `phrasebook-generate` verified live (tool-use call returns structured output). The one-off `recommend-diag` probe function has been neutralized (inert 410 stub, `verify_jwt=true`).

---

## Google Photos integration (owner import, family view)
Environment: migration `google_photos` (repo `00016_...`). New `google_photos` table + private `gphotos` storage bucket. Owner-gated import Edge Function (`gphotos`), `verify_jwt=true` + in-function `current_member_role()='owner'` check on every action (create/poll/import). The owner's Google access token is passed transiently and never stored.

RLS coverage:
- `google_photos_owner_all` — owner full access (import / re-file / delete).
- `google_photos_kid_select` — kids read owner-curated photos (no write policy → deny-by-default on insert/update/delete).
- **Guests: no policy → zero rows.** `shared_with_guests` column exists but guest sharing (signed-URL Edge Function, mirroring guest-photos) is intentionally deferred to Phase 2, so guests can never read Google-Photos content yet (CLAUDE.md rule #3).
- Storage `gphotos`: `gphotos_bucket_family_select` (owner + kid) for signed-URL reads; insert/update/delete owner-only. Import writes go through the service role in the Edge Function.

| Check | Method | Result |
|---|---|---|
| Import action rejects non-owner (kid/guest → 403) | live call via `pg_net` with a non-owner JWT, well-formed `action:"import"` payload → `403 {"ok":false,"error":"forbidden"}` | ✅ PASS (2026-07-27) |
| Kid can read imported rows, cannot insert/update/delete | probe rows; kid SELECT = 2, INSERT raised `42501`, UPDATE/DELETE affected `rows=0` | ✅ PASS (2026-07-27) |
| Guest reads zero unshared google_photos rows | probe rows (1 shared + 1 private); guest SELECT returned only the shared one | ✅ PASS (2026-07-27) — superseded by Phase 2 below |

Notes:
- Google shut down third-party Library/album-read APIs on 2025-03-31; the Picker API (explicit user pick) is the only sanctioned path — no library mirroring is possible or attempted.
- Only a **display-sized copy (~1600px)** is cached; full-res originals stay in Google Photos. Photo GPS is stripped by the Picker, so map placement is attach-to-place (Phase 2), never auto-geotag.
- **Prerequisite (owner):** `NEXT_PUBLIC_GOOGLE_CLIENT_ID` env var + Google Cloud project with the Photos Picker API enabled and the app origin in the OAuth client's authorized JS origins. Until set, the import button shows a "not configured" message; viewing/existing features are unaffected.

### Google Photos — Phase 2 (guest sharing + map attach)
Migration `google_photos_guest_share` (repo `00017_...`). New policy `google_photos_guest_select`: guests read a Google photo **only** when `public.is_active_guest_of(trip_id) AND shared_with_guests = true` — same rule as native `photos_guest_select` (DECISIONS #5). Guests still never touch the `gphotos` bucket directly: the `guest-gphotos` Edge Function (`verify_jwt=true`) lists rows through the caller's own JWT (so RLS returns only shared) and mints short-lived signed URLs with the service role — identical pattern to `guest-photos`.

Attaching a photo to a map pin (`map_pin_id`) is a plain owner UPDATE covered by the existing `google_photos_owner_all`; kids/guests have no UPDATE policy → deny-by-default. Attached photos render on the map for family only (owner+kid); guests see shared photos in their Photos gallery, not the map.

| Check | Method | Result |
|---|---|---|
| Guest reads only shared google_photos (unshared → 0) | probe rows (1 shared + 1 private); active guest saw exactly 1 | ✅ PASS (2026-07-27) |
| Revoked guest reads zero, even shared | same probes with `revoked_at = now()`; guest saw 0 google_photos, 0 photos, 0 journal | ✅ PASS (2026-07-27) |
| Kid/guest cannot set shared_with_guests or map_pin_id (no UPDATE policy) | kid UPDATE on google_photos and guest UPDATE on photos both affected `rows=0` | ✅ PASS (2026-07-27) |
| guest-gphotos returns signed URLs only for rows the caller's RLS allows | committed a **shared** probe photo, called the function with a non-guest JWT via `pg_net` → `200 {"ok":true,"photos":[]}` (no URLs issued); probe deleted afterwards | ✅ PASS (2026-07-27) |

### Flight & hotel search (travel-search Edge Function)
Feature added outside the sprint plan on request (search best flights/hotels from the route page). No new tables and no schema change: results are ephemeral and, when saved, become ordinary `bookings` rows covered by the existing owner-only bookings policies (kids/guests have no bookings policy → deny-by-default, so they can never read or write them).

Security surface is the Edge Function itself, mirroring `recommend`:
- Deployed `verify_jwt=true`; additionally re-checks `current_member_role() = 'owner'` in-function and returns 403 otherwise, so kids/guests cannot invoke the paid RapidAPI upstreams.
- The RapidAPI credential lives only as the `RAPIDAPI_KEY` function secret — never shipped to the client (CLAUDE.md rule #8). The browser calls the function; the function calls RapidAPI.
- Multi-country aware (rule #9): origin/destination and currency come from the request; nothing is hardcoded to a country or currency.
- Missing key → `not_configured` (503) → Hebrew "service not configured" message; upstream failure → `search_failed` (502) → generic Hebrew retry message. No secret or upstream detail leaks to the client.

| Check | Method | Result |
|---|---|---|
| Non-owner invoking travel-search → 403 | live call via `pg_net` with a non-owner JWT → `403 {"ok":false,"error":"forbidden"}` (never reaches RapidAPI) | ✅ PASS (2026-07-27) |
| travel-search with no Authorization header → 401 | live call via `pg_net` → `401 UNAUTHORIZED_NO_AUTH_HEADER` (platform `verify_jwt`) | ✅ PASS (2026-07-27) |
| RAPIDAPI_KEY never present in client bundle | key read via Deno.env in the function only | ✅ by construction (no NEXT_PUBLIC var) |
| Saved result becomes owner-only booking (kid/guest read → 0 rows) | probe booking; kid and guest SELECT both returned 0, kid INSERT raised `42501` | ✅ PASS (2026-07-27) |

## Full role-access matrix — verification pass (2026-07-27)

Closes the last open Sprint 8 acceptance criterion ("full role-access matrix documented with pass/fail, all pass"). Every previously ⏳ check above was executed against the **production database**, not reasoned about.

**Method.** Probe rows were inserted, queried as each role through the production auth path (`set local role authenticated|anon` + a resolved `member_id` JWT claim, exactly how `current_member_id()` resolves a real session), then the whole thing rolled back. Edge Functions were called for real via `pg_net` (outbound from the sandbox to `*.supabase.co` is blocked, so the DB itself made the requests) using the **anon key as a valid-but-non-owner JWT**. Baseline was re-checked afterwards: 4 members / 0 guests / 0 documents / 0 bookings / 0 photos / 6 itinerary days — **no probe rows persist**.

### Reads (probe data: 2 documents [1 kid-shared], 1 booking, 1 expense, 2 google_photos [1 shared], 3 photos [approved+shared / approved-unshared / pending+shared], 2 journal [1 shared])

| Table | owner | kid | guest | revoked guest | anon |
|---|---|---|---|---|---|
| documents | 2 ✅ | **1** (only `shared_with_kids`) ✅ | 0 ✅ | — | 0 ✅ |
| bookings | 1 ✅ | 0 ✅ | 0 ✅ | — | 0 ✅ |
| expenses / budget_categories | 1 ✅ | 0 ✅ | 0 ✅ | — | 0 ✅ |
| google_photos | 2 ✅ | 2 ✅ | **1** (shared only) ✅ | **0** ✅ | 0 ✅ |
| photos | 3 ✅ | — | **1** (approved **AND** shared) ✅ | **0** ✅ | 0 ✅ |
| journal_entries | 2 ✅ | — | **1** (shared only) ✅ | **0** ✅ | 0 ✅ |
| trips / members / itinerary_days / emergency_info | — | — | — | — | 0 ✅ |

### Writes

| Attempt | Outcome | Result |
|---|---|---|
| kid INSERT google_photos | `42501` RLS violation | ✅ blocked |
| kid UPDATE google_photos.shared_with_guests | `rows=0` | ✅ blocked |
| kid DELETE google_photos | `rows=0` | ✅ blocked |
| kid INSERT bookings | `42501` RLS violation | ✅ blocked |
| **kid uploads photo claiming `status='approved'`, `shared_with_guests=true`** | stored as `status=pending shared=false` | ✅ trigger enforces DECISIONS #4/#5 |
| guest UPDATE photos.shared_with_guests | `rows=0` | ✅ blocked |
| guest INSERT documents | `42501` RLS violation | ✅ blocked |
| guest UPDATE itinerary_days | `rows=0` | ✅ blocked |

### Storage buckets

All six buckets (`documents`, `photos`, `gphotos`, `map-photos`, `booking-files`, `backups`) are **private**. Every table in `public` has RLS enabled and at least one policy — no table is unprotected.

| Bucket | owner | kid | guest |
|---|---|---|---|
| documents | 1 ✅ | 0 (none shared) ✅ | 0 ✅ |
| booking-files | 1 ✅ | 0 ✅ | 0 ✅ |
| gphotos | — | 1 ✅ (family read, per design) | 0 ✅ |
| photos | — | — | 0 ✅ |
| backups | visible ✅ *(intended: `backups_owner_select`, owner-only read, service-role writes)* | 0 ✅ | 0 ✅ |

### Edge Function gates (live calls)

| Function | Call | Result |
|---|---|---|
| travel-search | no auth header | `401 UNAUTHORIZED_NO_AUTH_HEADER` ✅ |
| travel-search | non-owner JWT | `403 forbidden` ✅ (never reaches RapidAPI) |
| emergency-autofill | non-owner JWT | `403 forbidden` ✅ |
| gphotos (import) | non-owner JWT, well-formed payload | `403 forbidden` ✅ |
| guest-gphotos | non-owner JWT, **with a shared photo present** | `200 {"photos":[]}` ✅ (no signed URLs issued) |

### Observations (no action taken)

- **`gphotos` validates input before the role check**, so a malformed non-owner call gets `400` rather than `403`. Not a leak — nothing is read or written before the gate — but the gate is the *second* check, not the first. Worth reordering if the function is touched again.
- **`document_shared_with_current_kid` grants EXECUTE to `authenticated` but not `anon`** (unlike the other helpers, which grant PUBLIC). An anonymous query against `storage.objects` therefore raises `42501` instead of returning 0 rows. It **fails closed** — no data is exposed — and no app path queries storage anonymously (guests authenticate via magic link), so this was left as-is: erroring is the more restrictive behaviour.
- **`guest-gphotos` answers a non-guest with `200 []` rather than `403`.** Harmless (RLS yields nothing, so no URLs are minted), and consistent with `guest-photos`.

### Anonymous access through the real REST API (closes the Sprint 1 TODO)

Previously only verified by SQL role emulation. Now issued as real HTTP requests against `/rest/v1/` with the anon key (sent from the database via `pg_net`, since the sandbox cannot reach `*.supabase.co`), **against tables that genuinely contain rows**:

| Request (anon key) | Rows actually in table | Response |
|---|---|---|
| `GET /rest/v1/itinerary_days?select=*` | 6 | `200 []` ✅ |
| `GET /rest/v1/members?select=*` | 4 | `200 []` ✅ |
| `GET /rest/v1/trips?select=*` | 1 | `200 []` ✅ |

PostgREST returns `200` with an empty array rather than `403` — RLS filters the rows, which is the expected and correct behaviour.

## 2026-08-15 — Config drift: `verify_jwt` pinning + cron URL helper

Not a new feature; a hardening pass on configuration that previously lived only
in the Supabase dashboard. Migration `00019_cron_functions_base_url`.

| Check | Method | Result |
|---|---|---|
| Live `verify_jwt` per Edge Function matches what each function's header comment claims | `list_edge_functions` against the live project | ✅ PASS — 4 false (`fx-daily`, `push-send`, `backup-weekly`, `kid-auth`), 8 true |
| Those live values are now pinned in `supabase/config.toml` so a redeploy cannot flip them | file committed, values copied from the live read | ✅ PASS |
| `public.functions_base_url()` not executable by `anon` / `authenticated` | `revoke execute` in migration, mirroring `00002_function_hardening` | ✅ PASS |
| Re-scheduled cron jobs still resolve and reach the function | ran the new `fx-daily` body manually; `net._http_response` | ✅ PASS — `200 {"ok":true,"day":"2026-08-15","count":165,"source":"open.er-api.com"}` |
| All three jobs still active, correct schedules, owner `postgres` | `select * from cron.job` | ✅ PASS |
| Weekly backup actually producing files | `storage.objects` in the `backups` bucket | ✅ PASS — 5 files, newest 2026-08-09 03:00 |

Notes:
- `cron.job_run_details.status = 'succeeded'` proves only that the SQL ran:
  `net.http_post` queues the request, so a job reports success even when the HTTP
  call fails. Verify cron work by its effect, or via `net._http_response`.
- The helper falls back to the current project URL when
  `app.settings.functions_base_url` is unset, so it cannot introduce a
  NULL-URL failure mode.
- One deployed function is not in the repo: `recommend-diag`, a retired
  debugging endpoint. Inspected — inert (returns `410`, no data access, no AI
  call). Left deployed only because this toolset has no delete-function API;
  tracked in `docs/HANDOFF.md` §9.

## 2026-08-15 — Accepted risk: `xlsx` (SheetJS) advisories, no npm fix

`npm audit` reports 12 vulnerabilities (1 critical, 8 high, 3 moderate). All but
one are dev-only transitives (`sharp`/libvips via the toolchain) that never reach
the browser or a runtime. The one that ships is **`xlsx`**:

| Advisory | Effect |
|---|---|
| [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) | Prototype pollution |
| [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9) | ReDoS |

`npm audit fix` cannot resolve either — the npm-published line ends at the
pinned 0.18.5 and SheetJS moved patched builds to their own CDN, so audit
reports "No fix available".

### Exposure

| Question | Answer |
|---|---|
| Where does parsing run? | The **browser only**. All three call sites are `"use client"` and read a `File` via `arrayBuffer()` — `lib/importFile.ts` (checklists, map routes) and `lib/importItinerary.ts` (itinerary import) |
| Does it ever run server-side? | No. No Edge Function, route handler or server component imports `xlsx` |
| Who can reach it? | Owners only — the three import sheets live on `/itinerary`, `/checklists`, `/map`, all owner-gated by RLS |
| Blast radius | The owner's own tab. Prototype pollution there corrupts a session that already holds full owner access, so no privilege boundary is crossed. ReDoS hangs the tab |
| Realistic attack | An owner imports a hostile workbook received from a third party (travel agent, hotel), which pollutes the page and goes after the session token |

### Decision: accepted, keep parsing client-side

Moving the import server-side would make this **worse**, not better: the same
unpatched library would then run in a Node process near the service role, with
the file upload adding transport and storage surface on top. The browser tab is
the better isolation boundary — per-origin, ephemeral, no service-role access.

If the risk is ever judged too high, in preference order:

1. **Parse in a Web Worker.** Contains prototype pollution to the worker's own
   global scope; the page's `Object.prototype` is never touched. Contained
   change — the parsers already return plain arrays that post cleanly.
2. **Install SheetJS from the vendor CDN** rather than npm, which is where
   patched builds live. Trades the advisory for a dependency outside the npm
   registry — check the advisory pages for current guidance before doing it.

Re-review if an importer is ever moved server-side, or if a non-owner role is
ever given access to an import screen. Neither is true today.

## 2026-08-15 — "בנק אפשרויות" (place_options) + extract-places

New owner-only planning table and one new Edge Function. Migration
`00020_place_options` (additive) and `00021_drop_legacy_option_tables`
(deferred — see note below).

RLS covering this feature: `place_options_owner_all` (single policy, FOR ALL,
`is_owner_of(trip_id)` in both USING and WITH CHECK) — the same shape as the two
tables it replaces, so kids and guests have no path to planning content.

| Check | Method | Result |
|---|---|---|
| RLS enabled on `place_options`, exactly one policy | `pg_class.relrowsecurity` + `pg_policies` | ✅ PASS — enabled, 1 policy |
| `anon` sees zero rows **with a real row present** | probe row + `set local role anon` | ✅ PASS — `0` while the table held 1 |
| Supabase advisors raise nothing new for the table | `get_advisors(security)` | ✅ PASS — no RLS/policy lint; only the pre-existing accepted helper warnings |
| `extract-places` rejects an unauthenticated call | live POST via `pg_net` | ✅ PASS — `401 UNAUTHORIZED_NO_AUTH_HEADER` |
| `extract-places` deployed with `verify_jwt=true` and pinned in config.toml | deploy response + repo file | ✅ PASS |

Notes:

- **The role gate runs before input validation** in `extract-places`, so a
  non-owner gets `403` regardless of payload. This is deliberately the opposite
  order from `gphotos`, whose "validates first, gates second" behaviour was
  logged as an observation on 2026-07-27 — the new function does not repeat it.
- **Prompt injection is in scope here**, because the pasted text is untrusted
  third-party content (a Facebook post) fed to a model. Contained three ways:
  the text is delimited and explicitly labelled as data-not-instructions; the
  reply shape is pinned by a forced tool schema whose only fields are place
  attributes; and the function persists nothing — the owner reviews and ticks
  each candidate before anything is written. Worst case a hostile post proposes
  a junk row the owner declines.
- **`00021` is deliberately not applied yet.** Dropping `saved_links` while the
  deployed build still queries it would break the live `/links` screen. Apply it
  after this change is merged and deployed. Both tables were verified empty
  (0 rows each) before the split was planned, so nothing is lost either way.
- The probe row used for the anon check was deleted afterwards; the table is
  empty again.

## 2026-08-16 — geocode-places

New owner-gated Edge Function; no new tables or policies. It resolves the
options bank's place names into coordinates so the bank can be drawn on a map.

| Check | Method | Result |
|---|---|---|
| Deployed `verify_jwt=true` and pinned in config.toml | deploy response + repo file | ✅ PASS |
| Unauthenticated call rejected | live POST via `pg_net` | ✅ PASS — `401 UNAUTHORIZED_NO_AUTH_HEADER` |
| Role gate runs before input validation | code order | ✅ PASS — same ordering as extract-places |

Notes:

- **This function reads and writes through the CALLER's client, not the service
  role.** That is deliberate: RLS stays in force on every row it touches, so a
  request naming another trip's `trip_id` resolves to zero rows rather than
  being trusted. It is the same posture as `guest-photos`, and the opposite of
  the service-role functions (`fx-daily`, `backup-weekly`), which need to write
  where no user can.
- The only external calls are geocoding lookups (Google Geocoding when the key
  is set, else keyless Nominatim). The place name and its area/country are the
  only data leaving; no trip identifiers, no member data.
- Nominatim's usage policy asks for ~1 request/second and a User-Agent; the
  keyless path honours both. Work is batched (20 rows) so an invocation cannot
  run past the function timeout.
- Map InfoWindow content is built from pasted-post text, which is untrusted.
  `components/options/OptionsMap.tsx` escapes it before interpolating into the
  HTML string the Maps API requires — the one place in this feature where
  untrusted text meets raw HTML.

## 2026-08-27 — trips.total_budget + category CRUD

Migration `00022_trip_total_budget` adds one nullable column to `trips`. No new
table, no new policy, no new Edge Function.

| Check | Method | Result |
|---|---|---|
| `trips` RLS unchanged and still owner-only for writes | existing `trips` policies cover the new column | ✅ PASS — a column inherits its table's policies |
| `budget_categories` insert/update/delete reachable only by owners | existing `budget_categories_owner_all` | ✅ PASS |
| Deleting a category with expenses is refused, not cascaded | FK `expenses_category_id_fkey` (no ON DELETE) | ✅ PASS — raises 23503, surfaced in Hebrew |
| Negative total budget rejected at the database | `trips_total_budget_check` | ✅ PASS |

Notes:

- **Category delete deliberately has no cascade.** Removing a category that
  still carries expenses would either orphan or silently destroy spending
  records; the FK refuses instead, and the UI explains that the expenses must
  be moved first. This is the same posture as `deleteBooking`, which maps the
  same 23503 to `booking_linked`.
- The new column is nullable and NULL means "derive the total from the
  categories", which is the pre-existing behaviour — so a trip that never sets
  a budget behaves exactly as before.

## 2026-08-27 — performance & responsiveness fixes (no schema change)

No migration, no new table, no new policy, no new Edge Function. The changes
are client-side (service worker, auth gate, request de-duplication, code
splitting), so the security question is whether any of them weakens a check
that was previously enforced.

| Check | Method | Result |
|---|---|---|
| Kid/guest still cannot read documents, budget or unshared content | unchanged RLS policies; no query, table or policy touched | ✅ PASS |
| `AuthGate`'s optimistic render cannot grant data access | gate is client routing only; every read still goes through RLS with the caller's JWT | ✅ PASS — a rendered empty screen, not other people's data |
| Dropping `auth.getUser()` from `getCurrentMember()` | uid now read from the locally stored session; it only selects which `members` row to display, and RLS validates the JWT server-side on that query | ✅ PASS — a forged local uid returns no row |
| Service worker cannot serve one member's data to another | SW caches only same-origin app shell + hashed build assets; all Supabase traffic is cross-origin and now explicitly passes through untouched | ✅ PASS |
| Kid PIN gate still runs on cold start | `needsKidUnlock()` is still the first branch in the gate, and the sessionStorage flag is unchanged | ✅ PASS |

Notes:

- **The gate's 2.5 s timeout renders optimistically but never caches that
  verdict.** The real answer from `link_member_to_auth_user` still lands and
  still redirects or rejects; only the blank-screen wait was removed. This
  matches the existing posture for the offline case, where the gate already
  allowed the shell to render on RPC failure because security is RLS
  (CLAUDE.md rule #1), not the gate.
- **The service worker no longer caches RSC payloads.** Those responses are
  rendered per request and could carry member-specific content; keeping them
  out of the cache removes that question entirely, and was also required to
  stop stale navigation content.

## 2026-08-29 — Vault hardening: passphrase KDF + biometric unlock (M1)

Environment: migration `document_passkeys` (repo file `00023_...`). Closes
finding **M1** of `docs/SECURITY-REVIEW-2026-08.md` — the vault key was derived
from a 6–12 digit PIN at PBKDF2-210k, and the salt + verifier are cached
client-side, so a stolen device allowed an offline brute force of the whole
10⁶ space in well under a minute.

Two changes, one goal:

1. **Passphrase instead of PIN.** New vaults require ≥10 characters of
   anything (`MIN_PASSPHRASE_LENGTH`), derived at **600,000** PBKDF2-SHA256
   iterations. The cost is now stored per vault in `document_pin.iterations`
   rather than hardcoded, because changing it for an existing vault would make
   that vault's documents permanently undecryptable. Pre-existing vaults keep
   `210000` and keep opening with their old PIN — the unlock path deliberately
   does **not** enforce the new length rule.
2. **Biometric unlock (WebAuthn PRF).** A device's platform authenticator
   (Face ID / Touch ID / Android biometric) holds a credential whose PRF
   extension yields a stable 256-bit secret. That secret AES-GCM-encrypts a
   copy of the vault key into `document_passkeys.wrapped_key_*`. Day-to-day
   unlocking therefore costs an attacker 2²⁵⁶, not 10⁶; the passphrase is
   needed only to enrol a device or to recover one.

**No biometric data is received or stored.** WebAuthn returns a signature and
the PRF output; face and fingerprint templates never leave the device. There is
no face-recognition model anywhere in the app, and no new runtime dependency —
this is `navigator.credentials` plus the existing WebCrypto (CLAUDE.md rule #7).

RLS coverage: `document_passkeys_owner_all` (owner-only, same posture as
`document_pin`). Kids and guests get no policy → deny-by-default, consistent
with their zero access to `documents` (rule #2).

**Why the wrapped key is safe to store server-side.** Unlike the PIN's salt +
verifier — which is exactly what made M1 exploitable — these rows are not
brute-forceable. The wrapping key is 256 uniformly random bits held in the
device's secure enclave, so reading the whole table (as an owner, or with the
entire database) yields nothing without the physical authenticator.

| Check | Method | Result |
|---|---|---|
| Wrapped key round-trips to the same vault key; documents sealed before enrolment still open | `lib/docCrypto.test.ts` — wrap → unwrap → decrypt | ✅ PASS |
| A different PRF secret cannot unwrap the key | unit test, wrong 32-byte secret → rejects | ✅ PASS |
| Wrapped blob contains no plaintext key material | unit test, asserts ciphertext excludes the raw bits | ✅ PASS |
| Legacy vaults still open: a vault sealed at 210k does not open at any other iteration count, and the count is read per row rather than assumed | 2 unit tests + `fetchPinRow` reads `document_pin.iterations` | ✅ PASS |
| Enrolment is impossible while the vault is locked (nothing to wrap) | `enrollPasskey` throws `vault_locked` unless `isVaultUnlocked` | ✅ PASS |
| PRF secret and cached key bits are zeroed after use | `prfSecret.fill(0)` after wrap/unwrap; `lockVault()` zeroes `cachedBits` | ✅ PASS |
| Build / lint / typecheck / 100 unit tests | `npm run build`, `npm run lint`, `npx tsc --noEmit`, `npm run test` | ✅ PASS |
| `document_passkeys` owner-only; kid / anon read zero rows | SQL role emulation, probe row in a rolled-back transaction: owner **1**, kid **0**, anon **0** (same for `document_pin`) | ✅ PASS (2026-08-29) |
| Biometric enrol + unlock on the real devices | two phones + the Android tablet | ⚠️ **PENDING** — needs real hardware |

### Applied

`00023` was applied on 2026-08-29 and verified against the live schema:
`document_pin.iterations` (not null, default 210000), `document_pin.prf_salt`
(nullable), and `document_passkeys` with `document_passkeys_owner_all`.
`lib/database.types.ts` was regenerated — the hand-written entries matched the
generated output exactly, so no drift. `get_advisors(security)` reports no new
findings: the new table is not flagged, and only the pre-existing accepted
WARNs remain.

### ⚠️ Still to verify

- **PRF support must be verified on the actual devices**, not assumed. It needs
  a platform authenticator *and* a browser that implements the extension;
  installed PWAs on iOS are the historically weak spot. Everything
  feature-detects and fails soft — `isPasskeySupported()` gates the UI,
  `enrollPrfCredential` throws `prf_unsupported` rather than storing an
  unusable credential, and the passphrase always works — so an unsupported
  device degrades to today's behaviour rather than losing access.
- **Enrolment is per device**, and a lost device is revoked by removing it from
  the list on the Documents screen. That revocation is real, not cosmetic: the
  row carrying the wrapped key is deleted, so that authenticator can no longer
  produce anything useful. (Contrast with kid device revocation — finding H1,
  still open.)

Notes:

- **Changing the passphrase is still not possible** — it would require
  re-encrypting every locked document, unchanged from the original design.
  Enrolling a passkey does not alter that: the passkey wraps the *derived* key,
  so the passphrase remains the root secret and the sole recovery path.
- **M2 is untouched** by this work: an unlocked document marked "available
  offline" is still stored as plaintext in IndexedDB. The passphrase warning
  covers locked documents only.

## 2026-08-29 — Kid device revocation made real (H1) + offline plaintext warning (M2)

Environment: migration `kid_device_revocation` (repo file `00024_...`),
`kid-auth` Edge Function rewritten. Closes finding **H1** of
`docs/SECURITY-REVIEW-2026-08.md`, the one genuine hole the review found.

### What was wrong

Two defects that compounded:

1. `kid_devices.revoked_at` was read in exactly one place — the `unlock`
   branch of `kid-auth` — and by **no policy**. Once a session existed it never
   passed through that branch again, so "revoke device" set a timestamp and
   changed nothing. The tablet kept reading and writing.
2. The device token **was** the kid's Supabase auth password, and it sits in
   plaintext `localStorage`. Since the anon key ships to every browser, anyone
   holding the tablet could read the token and call `signInWithPassword`
   directly — past the PIN prompt, the attempt counter and the 15-minute
   lockout, all of which live only in `unlock`.

### What changed

- **`current_member_id()` now refuses to resolve a kid without an active
  device binding.** That function is the root of every policy in the schema —
  directly, or via `current_member_role()` / `is_kid_of()` / `is_owner_of()`,
  and for `storage.objects` too — so revocation now takes effect on the next
  query everywhere at once. This mirrors how guests always worked
  (`is_active_guest_of()` re-checks `revoked_at` per query).
  Fixing `is_kid_of()` instead would **not** have been enough: five policies
  match on `current_member_id()` without also calling it —
  `pocket_money_kid_select`, the USING clause of `pocket_expenses_kid_all`,
  `message_reads_self_all`, `push_subscriptions_self_all`,
  `members_self_select` — so a revoked kid would have kept reading their pocket
  money.
- **The device token is no longer a password.** It identifies the device to
  `kid-auth` and is stored only as a SHA-256 hash. The auth password is
  separate, random, never leaves the server, and is **rotated to a fresh value
  on every unlock** — it exists just long enough to mint one session, so a
  stolen token has nothing to replay.
- **`revokeDevice()` goes through the function**, not a direct table UPDATE. A
  new owner-gated `revoke` action sets `revoked_at` and, once no active device
  remains for that kid, rotates the auth password to a value nobody knows.
- **Registration order flipped**: the new binding is inserted *before* old ones
  are revoked. Under the new rule a kid with zero active devices cannot resolve
  at all, so the old order would have opened a window where in-flight requests
  saw nothing.

| Check | Method | Result |
|---|---|---|
| Revoking a device stops all reads for that kid | SQL role emulation, kid claims, one rolled-back transaction: **active device** → resolves, 227 itinerary days, 1 pocket_money; **revoked** → does not resolve, **0** days, **0** pocket_money | ✅ PASS (2026-08-29) |
| A revoked device's token cannot mint a session via `kid-auth/unlock` | `unlock` filters on `revoked_at is null` → 401 `unknown device` | ✅ PASS — by construction, unchanged from before |
| A stolen device token cannot sign in directly against Supabase Auth | token is no longer the password; password is random, server-only, rotated per unlock | ✅ PASS — by construction |
| Owners are unaffected by the new condition | same probe, owner control row: resolves, 227 itinerary days, 1 pocket_money | ✅ PASS (2026-08-29) |
| `revoke` rejects a non-owner caller | `ownerCaller()` re-checks `current_member_role() = 'owner'`, same pattern as `create-registration` | ✅ PASS — by construction |
| `revoke` rejects a device belonging to another trip's kid | trip_id compared against the calling owner's | ✅ PASS — by construction |
| Policy-evaluation cost of the added EXISTS | partial index `idx_kid_devices_active on kid_devices(member_id) where revoked_at is null` | ✅ PASS — index-backed |
| Build / lint / typecheck / 100 unit tests | `npm run build`, `npm run lint`, `npx tsc --noEmit`, `npm run test` | ✅ PASS |

### M2 — offline plaintext warning

An offline copy of a **locked** document is ciphertext and safe at rest. An
**unlocked** one is the file itself, readable from IndexedDB with no passphrase
in front of it. Marking an unlocked document "available offline" now warns in
Hebrew and asks for confirmation, naming the passport case and pointing at the
lock toggle. This is the mitigation the review recommended; it does not change
where the bytes live. Encrypting every offline copy under the vault key would,
but it would also make offline access impossible for families who never set a
passphrase — a behaviour change worth deciding on deliberately rather than
assuming.

### Deployed and applied

Both shipped on 2026-08-29, in the required order:

1. **`kid-auth` redeployed** — version 7, ACTIVE, `verify_jwt=false` preserved
   per `supabase/config.toml`.
2. **Migration `00024` applied** — `current_member_id()` carries the kid-device
   condition live, and `idx_kid_devices_active` exists.

The pocket-money column of the probe is the one worth keeping: it went to
**0** on revocation, and that is precisely the row a fix in `is_kid_of()`
alone would have left readable. `get_advisors(security)` after the change
reports no new findings.

All probe rows (kid device, pocket money, document pin, passkey) were created
inside transactions that were rolled back; a follow-up count confirms
**0 kid_devices, 0 pocket_money, 0 document_passkeys** persist.

### ⚠️ Still to verify

- **Register + unlock + revoke on the real tablet.** The rewritten `kid-auth`
  changes the credential model, and the whole flow has never run end to end on
  hardware — the Sprint 6 log still carries a PENDING for PIN unlock, blocked
  back then on the Email provider being disabled. Bind the tablet, unlock with
  the PIN, then press revoke in the owner UI and confirm the tablet drops to
  registration on its next cold start.

Notes:

- **`link_member_to_auth_user()` deliberately still returns a role for a
  revoked kid**, so `AuthGate` renders the shell rather than an error. That is
  the existing posture for revoked guests too: the gate is client-side routing,
  RLS is the boundary, and the kid sees empty screens. On the next cold start
  `needsKidUnlock()` sends them to `/kid-login`, `unlock` returns 401, and
  `forgetKidDevice()` drops them back to registration with a clear message.
- **The PIN lockout still resets `failed_attempts` on lock expiry** (5 attempts
  per 15 minutes). Left as-is: an escalating counter risks locking a child out
  of their own tablet permanently, and with the token no longer usable as a
  password the PIN is no longer the only thing standing between a found device
  and a session.

## 2026-08-29 — Cron shared secret (M3/M4), headers (M6), EXIF + signed URLs (L2/L3)

Environment: migration `cron_shared_secret` (repo `00025_...`) applied; Edge
Functions `fx-daily` (v7), `push-send` (v8), `backup-weekly` (v7),
`guest-photos` (v7), `guest-gphotos` (v3) deployed. All `verify_jwt` values
unchanged.

### M3 + M4 — the cron functions are no longer open to the world

`fx-daily`, `push-send` and `backup-weekly` run `verify_jwt = false` because
pg_cron carries no JWT, which left all three invokable by anyone who knows the
project URL. The jobs and the two push triggers now send an `x-cron-secret`
header from `app.settings.cron_secret`; each function compares it against its
`CRON_SECRET` secret in constant time.

**The check fails OPEN while `CRON_SECRET` is unset.** Shipping it closed would
have stopped FX, push and backups with nothing surfacing the failure — the
exact silent breakage `supabase/config.toml` exists to prevent, and precisely
what had already happened to the backup (below). Enforcement begins when the
secret is set on both sides; until then behaviour is unchanged.

| Check | Method | Result |
|---|---|---|
| `fx-daily` still works through the new header path | fired via `pg_net` with `cron_secret_header()` → `200 {"ok":true,"day":"2026-08-29","count":165,"source":"open.er-api.com"}` | ✅ PASS |
| `push-send` still works through the new header path | same → `200 {"ok":true,"weather":0,"checkin":0}` | ✅ PASS |
| `backup-weekly` still works through the new header path | same → `200 {"ok":true,...}` | ✅ PASS |
| Constant-time comparison, no early return on mismatch | `cronAuthorized()` XORs the full length | ✅ PASS — reviewed |
| `cron_secret_header()` not callable by client roles | `revoke execute` from public/anon/authenticated, same posture as `functions_base_url()` | ✅ PASS |
| Enforcement actually rejects a bad secret | needs `CRON_SECRET` set | ⚠️ **PENDING** — see "to activate" below |

**To activate** (two sides, both required):

```
openssl rand -hex 32
alter database postgres set app.settings.cron_secret = '<value>';
# then set CRON_SECRET to the same value for fx-daily, push-send and
# backup-weekly (dashboard → Edge Functions → Secrets)
```

Where the secret lives: `app.settings.cron_secret` is readable by any database
session, same as `app.settings.functions_base_url`. Acceptable here because no
client role has raw SQL access — kids, guests and owners reach Postgres only
through PostgREST, which exposes no `current_setting` RPC. Vault would be
stricter and is more machinery than this app needs.

### 🔴 INCIDENT found while doing the above — the weekly backup had been dead for three weeks

Not a review finding; caught by checking `backup-weekly`'s table list against
the live schema.

Migration `00021` dropped `saved_recommendations` (superseded by
`place_options`) on ~2026-08-15. The table stayed in the function's `TABLES`
array, so every run errored on it and returned 500 **before writing anything**.
The cron job kept reporting success, because `net.http_post` only queues the
request — the SQL succeeds whatever the HTTP call does. Nothing surfaced it.

- **Last good backup: 2026-08-09.** The 08-16 and 08-23 runs wrote nothing.
- The list had also drifted past four newer tables that were never in **any**
  backup: `document_pin`, `document_passkeys`, `google_photos`, `place_options`
  — the last of which holds **207 rows**.
- `document_pin` is the one that would have hurt most: it holds the per-vault
  salt, and without that row the passphrase cannot re-derive the key, so every
  locked document would be gone for good.

Two fixes: the list is corrected, and **a failing table no longer aborts the
run** — it is recorded in `failed_tables` in the snapshot and in the response,
and everything else is still written. A backup missing one table is worth far
more than no backup. A run where *every* table fails still returns 500 rather
than writing an empty snapshot over good history.

| Check | Method | Result |
|---|---|---|
| Backup runs again and writes a file | fired via `pg_net` → `200`, `backup-2026-08-29-06-57-15.json` | ✅ PASS |
| Every table now reads cleanly | response carries no `failed` key | ✅ PASS |
| Previously-missing tables are captured | `place_options: 207`, `document_pin: 0`, `document_passkeys: 0`, `google_photos: 0` present in `counts` | ✅ PASS |
| Backup history restored | bucket now holds a 2026-08-29 object after a 20-day gap | ✅ PASS |

**Worth doing separately:** nothing watches whether these jobs actually
succeed. `cron.job_run_details` reports success for a queued request, so the
only real signal is `net._http_response`. A weekly check that the newest
`backups` object is less than 8 days old would have caught this in a week
instead of three.

### M6 — security headers

`next.config.ts` was empty. Now sends, on every route: `Permissions-Policy`
(`geolocation=(self), camera=(self), microphone=()`), `Referrer-Policy`
(`strict-origin-when-cross-origin`), `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, plus a `Content-Security-Policy-Report-Only`.

Rationale per header is in the file. Two deliberate omissions: **HSTS** (Vercel
already sends it; setting `max-age` from the app risks pinning a custom domain
early), and **an enforced CSP** — a real policy has to accommodate the Google
Maps JS API and Next's inline bootstrap, and getting it wrong takes the app
down rather than degrading it. Report-only surfaces violations in the console
with no user impact. It is a tuning aid, not protection, until someone loads
the map, photos and recommendations screens, reads the violations, tightens the
policy and renames the header.

| Check | Method | Result |
|---|---|---|
| Headers present on every route | `source: "/:path*"` in `next.config.ts`; `npm run build` passes | ✅ PASS |
| Geolocation restricted to first party | `Permissions-Policy: geolocation=(self)` | ✅ PASS |
| Headers observed on the deployed site | needs a Vercel deploy | ⚠️ **PENDING** — verify after deploy |

### L2 — EXIF stripped from map photos

`compressImage()` re-encodes through a canvas, which drops EXIF including the
GPS tag. It ran only on gallery photos; the two "where's the car" upload paths
sent the original file. Both now go through it. The bucket is owner-only, so
this was never an external leak — but there was no reason to keep coordinates
nobody asked for. Document uploads still go up untouched, deliberately: a
passport scan is not an image to re-encode.

### L3 — guest signed URLs cut from 60 to 15 minutes

A signed URL needs no auth once minted, so a guest can forward one to anyone.
An hour was a wide window for photos of the kids; 15 minutes still covers a
gallery load with room to spare. Both `guest-photos` and `guest-gphotos`.

### Still open from the review

- **M5 (the family wall)** — a decision, not a defect. Guests read and write
  the same feed as the kids, per DECISIONS #15. Left untouched pending an
  explicit call: leave it, make guests read-only, or split the feeds.
- **L1 (`xlsx@0.18.5`)** — left alone on purpose. The fixes exist only on
  SheetJS's own CDN, not npm, and the alternative is dropping `.xlsx` import,
  which `strings.ts` advertises as a Google Sheets workflow. Both options are
  product decisions.
- **L4 (leaked password protection)** — a dashboard toggle, one click, cannot
  be set from a migration.

## 2026-08-29 (later) — Backup freshness alert, CSP origin gap, and what CRON_SECRET actually needs

### The monitoring gap that let the incident run for three weeks

The backup fix earlier today repaired the symptom. This closes the reason
nobody noticed, which is structural rather than a one-off:

- `cron.job_run_details` records **SUCCESS** for the backup job, because the
  job body is `select net.http_post(...)` — which only *queues* a request. It
  succeeds whether the function returns 200, 500, or never answers.
- The only honest signals are the HTTP response in `net._http_response` and
  the presence of a fresh object in the `backups` bucket.

Migration `00026` adds `check_backup_freshness()` on a Monday 04:00 UTC cron
(the morning after the Sunday 03:00 backup). If the newest object in `backups`
is older than **8 days** it pushes an alert to the owners. Eight and not seven:
a healthy system is always ~25 hours stale, so 8 fires after exactly one missed
run with no jitter false-alarms. `push-send` gained a `backup-stale` type to
carry it.

It deliberately does **not** self-repair. A failed backup needs a person to ask
why; a silent retry would hide the next structural break exactly as the last
one was hidden.

| Check | Method | Result |
|---|---|---|
| Freshness function returns healthy on a fresh backup | `select public.check_backup_freshness()` → `{"ok":true,"age_days":0.19}` | ✅ PASS |
| Cron job registered | `cron.job` → `backup-freshness @ 0 4 * * 1` | ✅ PASS |
| `backup-stale` route reaches its handler | `pg_net` POST `{"type":"backup-stale","age_days":21}` → `200 {"ok":true,"sent":0}` | ✅ PASS |
| Unknown type still rejected | `pg_net` POST `{"type":"nonsense"}` → `400 {"ok":false,"error":"unknown type"}` | ✅ PASS |
| Helper not callable by client roles | `revoke execute` from public/anon/authenticated | ✅ PASS |

### 🟠 The alert currently reaches nobody — and so does every other notification

`push_subscriptions` holds **0 rows**. VAPID is configured (push-send returns
200 rather than "VAPID keys not configured", which closes the Sprint 8 PENDING
on the keys), but nobody has ever enabled notifications on a device. That
`"sent":0` above is the whole story.

This is not specific to the new alert. **Every push feature in the app is
currently inert**, including the two that matter for the kid-safety flow:

- *new photo pending approval* → the owner is never told a kid uploaded
  something, so approval depends on someone opening the Photos screen;
- *new wall message* → nobody is notified;
- rain-on-outdoor-day and flight check-in reminders.

The fix is not code: open `/notifications` on each phone and grant permission
(on iOS the app must be installed to the home screen first — the screen
explains this). Worth doing before the trip, not during it.

### CSP: an origin gap found by grepping rather than guessing

The report-only policy shipped this morning was written from the obvious
origins. Checking it against every external URL the client code actually
reaches turned up one the policy would have blocked:

`lib/gphotos/picker.ts` loads **`https://accounts.google.com/gsi/client`** as a
script and runs the Google Identity Services token flow in an **iframe**. An
enforced policy without `script-src`/`connect-src`/`frame-src` entries for
`accounts.google.com` would have broken Google Photos import — and only the
first time somebody tried to use it, long after the change that caused it.

Added to `script-src`, `connect-src` (plus `www.googleapis.com` for the token
endpoint) and a new `frame-src`. The other origins found in the source
(`ourairports.com`, `booking.com`, `embassies.gov.il`) are a data-provenance
comment, URL-normalisation test fixtures, and an `href` respectively — none is
a resource load, so none needs a directive.

This is the argument for calibrating the policy from the running app before
enforcing it: a grep found one gap, the browser will find the rest.

### CRON_SECRET — both sides need dashboard access, including the database side

Setting the database side from here failed:

```
ERROR: 42501: permission denied to set parameter "app.settings.cron_secret"
```

The MCP connection's role cannot `alter database ... set`. So both halves need
the project owner:

```
openssl rand -hex 32
alter database postgres set app.settings.cron_secret = '<value>';   -- SQL editor
# then CRON_SECRET = same value on fx-daily, push-send, backup-weekly
```

⚠️ **Do not reuse any value that appeared in an agent transcript.** The failed
attempt above generated a candidate server-side, and Postgres echoed it back
inside the permission error — it was never stored anywhere, but it is burned.
Generate a fresh one.

Until both sides are set, the gate stays fail-open and behaviour is unchanged.

## 2026-08-29 (evening) — M5 wall split, M2 offline encryption, L1 decision

Owners made the three calls the review left to them. Migrations `00027` applied,
`push-send` redeployed (v11).

### M5 — the wall is now two feeds

`messages.channel` (`family` | `guests`):

- **family** — owners + kids. Guests cannot read or write it.
- **guests** — owners + guests. Kids cannot read or write it.

Parents are in both and are the bridge. Kids are kept out of the guest feed
**entirely** rather than given read-only access, on the reasoning that a feed a
child can read is a feed a child can be addressed in.

Verified by role emulation against the live database, one probe message in each
feed, all inside a rolled-back transaction:

| Role | family visible | guests visible | cross-channel write |
|---|---|---|---|
| kid | **1** | **0** | into `guests` → **blocked** |
| guest | **0** | **1** | into `family` → **blocked** |
| owner | 1 | 1 | — (both, by design) |

Neither kids nor guests have an UPDATE policy on `messages` — they never did —
so neither can move an existing message between channels. Deny-by-default
covers what would otherwise need a guard trigger.

**The push fan-out had to change too, or the split would have leaked by
notification.** `handleWallMessage` previously notified every member of the
trip; a guest would have received a push *preview* of a family message the
policies forbid them to open. It now derives the audience from the channel.

DECISIONS #15 is struck through and superseded by a new #18.

### M2 — offline copies are encrypted at rest

`makeAvailableOffline` now stores ciphertext. A `pin_protected` document was
already its own ciphertext and is saved unchanged (`offlineEncrypted: false` —
`decryptDocument` owns that unwrapping); everything else gets an AES-GCM layer
under the vault key.

Consequences, accepted deliberately:

- **Taking a document offline now requires the vault.** That is the point — the
  old behaviour wrote the passport to IndexedDB in the clear.
- Opening online still needs no key, so the common path is unchanged.
  `openDocument` returns `"needs-key"` only when an encrypted offline copy is
  the *only* copy, and the screen prompts then.
- Removing an offline copy needs no key either.
- `offlineEncrypted` is optional on the stored record and absent means false,
  so a legacy plaintext copy still opens instead of failing to decrypt. There
  are none today (0 documents), but the flag makes that explicit rather than
  implied.

The confirm dialog added this morning is gone — it warned about a hazard that
no longer exists.

### L1 — `xlsx@0.18.5` stays

Owners' call, and the right one for this app: only a parent ever supplies a
file, the fixed builds exist only on SheetJS's own CDN rather than npm, and the
`.xlsx` path is an advertised Google Sheets workflow. Vendoring the CDN build
would mean hand-updating a checked-in bundle forever; dropping it would break a
real workflow to close a hole nobody can reach. Recorded as an accepted risk —
revisit if the import ever accepts a file from outside the family.

| Check | Method | Result |
|---|---|---|
| Kid cannot read or write the guest feed | role emulation, live | ✅ PASS |
| Guest cannot read or write the family feed | role emulation, live | ✅ PASS |
| Owner sees both feeds | role emulation, live | ✅ PASS |
| Push audience follows the channel | `handleWallMessage` derives it from `msg.channel` | ✅ PASS — reviewed |
| Offline copy of an unlocked document is ciphertext | `makeAvailableOffline` encrypts unless `pin_protected` | ✅ PASS — reviewed |
| Build / lint / typecheck / 100 unit tests | `npm run build`, `lint`, `tsc --noEmit`, `test` | ✅ PASS |
| End-to-end on real devices (two feeds, offline docs) | — | ⚠️ **PENDING** — needs the phones and tablet |
