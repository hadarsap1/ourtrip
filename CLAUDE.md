# OurTrip - Project Instructions for Claude Code

## What this project is
A family trip management PWA for Hadar, Sivan and their two kids (early elementary age), plus view-only family guests in Israel. Hebrew RTL UI. Personal app, not commercial. **Multi-country, round-the-world trip** - nothing may assume a single destination country, currency, or language. Full spec in `docs/SPEC.md`, sprint plan in `docs/ROADMAP.md`, locked decisions in `docs/DECISIONS.md`.

## Stack (locked - do not propose alternatives)
- Next.js 14+ (App Router) + React + TypeScript (strict)
- Tailwind CSS, RTL-first
- Supabase: Auth (Google OAuth + magic links), Postgres with RLS, Storage, Realtime, Edge Functions
- Deployed on Vercel
- PWA: Service Worker + IndexedDB (via `idb` library) for offline
- External APIs: Open-Meteo (weather), open.er-api.com / exchangerate.host (currency, global coverage; Frankfurter as fallback), Google Maps JavaScript API, Anthropic API (local recommendations)

## Hard rules
1. **Security is enforced in the database, never only in the UI.** Every table gets RLS policies. Every feature PR must state which policies cover it. Reference: `docs/SCHEMA.sql`.
2. **Three roles only: owner, kid, guest.** Kids and guests must never be able to read documents, budget, or unshared content - verify at the policy level.
3. **Kid photos require owner approval before guests can see them.** `photos.status` must be `approved` **and** `photos.shared_with_guests` must be `true` before any guest-visible query returns it. Approval and sharing are separate steps; no exceptions, no config flag to disable.
4. **All UI text in Hebrew**, RTL layout (`dir="rtl"` at the root). Dates in DD/MM/YYYY, ILS formatted with ₪. Keep UI strings in a single `lib/strings.ts` file - no hardcoded Hebrew inside components.
5. **Mobile-first.** Primary devices: two phones + one Android tablet. Bottom tab navigation. Test viewport 390px.
6. **Offline-critical features** (documents vault, today's itinerary, emergency page, phrasebook) must work with network disabled. Everything else degrades gracefully with a clear Hebrew offline banner.
7. **Do not add dependencies without stating why.** Prefer the platform (Supabase, browser APIs) over new libraries.
8. **No secrets in code.** All keys in `.env.local` / Vercel env vars. Never commit `.env*`.
9. **Multi-country awareness.** Emergency page, phrasebook, and weather are keyed by the current/selected country or day - never hardcode a destination.

## Working conventions
- Work sprint by sprint from `docs/ROADMAP.md`. Do not start a later sprint's features early unless asked.
- Before writing code for a sprint: restate the sprint's acceptance criteria, list the files you plan to touch, then implement.
- After each sprint: run `npm run build` and `npm run lint`, fix all errors, then summarize what was built against the acceptance criteria.
- Every schema change goes through a Supabase migration file in `supabase/migrations/` - never mutate the DB ad hoc.
- Commit style: `sprint-N: short description` (e.g. `sprint-2: itinerary CRUD with realtime sync`).
- When something in the spec is ambiguous, ask one focused question instead of guessing. When something is NOT in the spec, do not build it.

## Definition of done (every feature)
- Works on mobile viewport, RTL, in Hebrew
- RLS verified: attempted access with the wrong role fails (write a quick check in `docs/SECURITY-CHECKS.md` log)
- Realtime sync verified across two browser sessions where relevant
- Offline behavior defined: either works offline or shows the offline banner
- No TypeScript errors, no lint errors, build passes
