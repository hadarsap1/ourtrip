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
- TODO Sprint 1 wrap-up: re-run the anon check from a real client (REST) once deployed — this container's network policy blocks direct outbound to supabase.co, so the check ran via SQL role emulation.

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
