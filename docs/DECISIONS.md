# OurTrip - Locked Decisions

Decisions already made by Hadar & Sivan. Claude Code: do not reopen these; if implementation reveals a real blocker, raise it explicitly instead of silently deviating.

| # | Decision | Detail |
|---|---|---|
| 1 | PWA, not native | Installable web app; offline via SW + IndexedDB |
| 2 | Stack | Next.js + TypeScript + Tailwind + Supabase + Vercel |
| 3 | Roles | owner / kid / guest only, enforced by RLS |
| 4 | Kid photos need approval | Always. No setting to disable. Kid uploads force `pending` server-side |
| 5 | Guest sharing is opt-in per item | Nothing is guest-visible by default. For photos this means BOTH `status='approved'` AND `shared_with_guests=true` — approval alone never exposes a photo to guests, including owner uploads |
| 6 | Language | Hebrew RTL UI everywhere, incl. guest portal |
| 7 | Base currency | ILS; expenses keep original currency + conversion. FX provider: open.er-api.com / exchangerate.host (global coverage — the trip crosses many currency zones), Frankfurter as fallback, last-known-rate as final fallback |
| 8 | Out of scope | Memory book PDF, live flight tracking, email auto-extraction (backlog), multi-trip UI |
| 9 | Offline-critical set | Documents (flagged), today's itinerary, emergency page, phrasebook |
| 10 | Conflict policy | Last-write-wins + toast notification. Every editable table carries `updated_at` (trigger-maintained) |
| 11 | Photo size | Client-side compression ~1600px / ~300KB target |
| 12 | Pocket money | Informational; excluded from family budget totals |
| 13 | Cut order under pressure | Notifications → recommendations. Never security/backup |
| 14 | App name | **OurTrip** (was TripHub in early drafts; renamed 2026-07-16) |
| 15 | ~~Messages = one shared family wall~~ **superseded 2026-08-29 (see #18)** | Was: owners + kids + guests all read/write the same feed. The 2026-08 security review (finding M5) flagged this as the only place anything reaches a guest — or reaches the kids *from* a guest — without a parent approving it first |
| 16 | Multi-country trip | Round-the-world route. Emergency page + phrasebook are per-country/per-language; weather + FX follow the itinerary day's location. Nothing assumes a single destination |
| 17 | Guest invite emails | Supabase built-in SMTP is rate-limited (~2/hour) and not production-safe — use custom SMTP (e.g. Resend free tier) for magic links from Sprint 7 |
| 18 | Messages = two feeds | `messages.channel`: **family** (owners + kids) and **guests** (owners + guests). Parents are in both and are the bridge; kids are kept out of the guest feed entirely, since a feed a child can read is a feed a child can be addressed in. Enforced by RLS, not the client — migration `00027`. Unread state still per member in `message_reads` |
| 19 | Options bank has two exits | An option reaches a day as an itinerary item (`planned`) or becomes a booking (`booked`). Booking-only was the reason 343 collected options never moved: you do not reserve a viewpoint. Areas are canonicalised so "how many options here, how many days here" is answerable — migrations `00029`/`00030` |
