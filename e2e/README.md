# End-to-end tests

Three suites, all driving the real app in Chromium.

## Smoke suite (no credentials) - `npm run test:e2e`

`smoke.spec.ts` boots the app with **no** Supabase env. In that mode `AuthGate`
bypasses (see `components/AuthGate.tsx`), so the full Hebrew RTL shell renders
and we can verify:

- root document is `dir="rtl"` / `lang="he"`
- the five owner nav tabs render and navigate; nav is hidden on login screens
- the PWA manifest is served
- all 21 routes mount (HTTP status, no error dialog, no uncaught exceptions)

No setup needed - it runs anywhere.

## Populated suite (no credentials) - `npm run test:e2e:populated`

`populated.spec.ts` signs an owner in and fills every screen with a whole
trip, still with no Supabase project. The app starts against a fake URL and
`support/mockSupabase.ts` answers every call the browser makes, from the
synthetic trip in `support/fixtures.ts` (ten legs, six countries, bookings,
expenses, documents, phrasebook). It runs at 390px and at 1280px, at two
moments: five weeks before departure and day 3 of the trip (the clock is
fixed with `page.clock`).

It checks every owner screen for one `h1`, no sideways scroll and no uncaught
exception, plus the regressions from `docs/QA-REVIEW-2026-09-24.md`.

What it does NOT test: RLS (the mock answers as an owner and enforces no
policy - that is `docs/SECURITY-CHECKS.md`), writes (accepted, never stored),
Realtime, Storage and Edge Functions (they answer empty or with an error).

The fixtures are invented. Do not paste live rows into them: this file is
committed.

## Authenticated suite (needs a test project) - `npm run test:e2e:auth`

`authenticated.spec.ts` logs a real **owner** in and drives owner-only screens,
proving `AuthGate` + RLS let a valid member through. It **skips itself** unless
all four env vars are set:

| Var | Meaning |
|-----|---------|
| `E2E_SUPABASE_URL` | A throwaway **test** Supabase project URL |
| `E2E_SUPABASE_ANON_KEY` | That project's anon key |
| `E2E_TEST_EMAIL` | A seeded **owner** member with a password set |
| `E2E_TEST_PASSWORD` | That user's password |

The account must be a real owner row - `link_member_to_auth_user` rejects
sessions with no member role. Use a disposable project, never production.

```bash
export E2E_SUPABASE_URL="https://<ref>.supabase.co"
export E2E_SUPABASE_ANON_KEY="<anon key>"
export E2E_TEST_EMAIL="e2e-owner@example.com"
export E2E_TEST_PASSWORD="<password>"
npm run test:e2e:auth
```

The auth config (`playwright.auth.config.ts`) starts the app wired to the same
project, and the test signs in through Supabase and seeds the session into
`localStorage` before first paint. To point at an already-running app instead,
set `E2E_BASE_URL`.

> Note: supabase-js v2 persists the session object directly under
> `sb-<ref>-auth-token`. If a future version changes that shape, adjust the
> injected value in `authenticated.spec.ts`.
