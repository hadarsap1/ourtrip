# End-to-end tests

Two suites, both driving the real app in Chromium at the 390px mobile viewport.

## Smoke suite (no credentials) — `npm run test:e2e`

`smoke.spec.ts` boots the app with **no** Supabase env. In that mode `AuthGate`
bypasses (see `components/AuthGate.tsx`), so the full Hebrew RTL shell renders
and we can verify:

- root document is `dir="rtl"` / `lang="he"`
- the five owner nav tabs render and navigate; nav is hidden on login screens
- the PWA manifest is served
- all 21 routes mount (HTTP status, no error dialog, no uncaught exceptions)

No setup needed — it runs anywhere.

## Authenticated suite (needs a test project) — `npm run test:e2e:auth`

`authenticated.spec.ts` logs a real **owner** in and drives owner-only screens,
proving `AuthGate` + RLS let a valid member through. It **skips itself** unless
all four env vars are set:

| Var | Meaning |
|-----|---------|
| `E2E_SUPABASE_URL` | A throwaway **test** Supabase project URL |
| `E2E_SUPABASE_ANON_KEY` | That project's anon key |
| `E2E_TEST_EMAIL` | A seeded **owner** member with a password set |
| `E2E_TEST_PASSWORD` | That user's password |

The account must be a real owner row — `link_member_to_auth_user` rejects
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
