# The app with data, per role, locally

The quality gates (`e2e/quality-gates.spec.ts`) run on the no-backend shell:
eight screens, no rows. What a kid or a guest actually sees needs rows that
came through their own policies. This is that, with no Supabase project:

- the RLS harness database (all migrations) + `seed.sql`, an invented family
- PostgREST in front of it, so every read is filtered by the real policies
- `proxy.mjs` in the place of the project URL: REST passes through, auth is
  answered from the token, storage serves a placeholder picture, and
  functions / realtime are absent (404)
- `crawl.mjs` signs in as each role by placing a session in localStorage
  (a token signed with the local secret) and opens every screen

```bash
scripts/uicrawl/up.sh        # prints the build, start and crawl commands
scripts/uicrawl/up.sh down
```

What it cannot show: edge functions (so a guest's photo grid, which arrives
through `guest-photos`, appears only in its failed state), uploads, realtime,
push, and Google Maps without a key. First used in `docs/QA-2026-11-15.md`.
