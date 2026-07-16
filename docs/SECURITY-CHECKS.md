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
