# OurTrip - Product Specification

## 1. Users and permissions

| Role | Who | Sees | Edits |
|---|---|---|---|
| `owner` | Hadar + Sivan, Google OAuth, emails allowlisted in `members` | Everything | Everything |
| `kid` | Kids' tablet, PIN login on an owner-approved device | Today view (itinerary summary + weather), own journal, photos, messages inbox, own pocket-money tracker, phrasebook, emergency page | Own journal entries, photo uploads (pending approval), messages, own pocket-money expenses |
| `guest` | Specific invited emails via magic link | Only content flagged `shared_with_guests`: approved+shared photos, shared journal entries, "completed" itinerary map, family wall messages | Can send messages on the family wall |

### Auth flows
- **Owners**: Supabase Auth with Google OAuth. On first login, email must exist in `members` with role `owner`, otherwise sign out with an error page. The two owner emails are seeded in the initial migration (placeholder values - Hadar fills real emails in `.env` seed step).
- **Kids**: A kid session is a device-bound profile, not a full auth user. Owner registers the tablet from their own logged-in session (generates a device token stored in the DB + tablet localStorage). Kid unlocks with a 4-digit PIN (server-side verification, rate-limited via `failed_attempts`/`locked_until`). All kid API access goes through the device token, mapped server-side to a restricted `kid` role. **Design note (decide in Sprint 1, build in Sprint 6):** kid sessions are minted as Supabase-compatible JWTs by an Edge Function (device token + PIN → JWT with a `member_id` claim); the `current_member()` RLS helper must resolve both regular auth users and kid JWTs from day one.
- **Guests**: Owner adds guest email → system sends magic link (Supabase OTP over custom SMTP — see DECISIONS #17). On login, email must match the invited list and not be revoked. Sharing a forwarded link with a different email fails.

## 2. Features

### 2.1 Today view (home screen for owners and kids)
- Date, current location context, today's itinerary items in time order
- Weather for today's location (Open-Meteo), inline per itinerary day
- Relevant bookings for today (e.g. tonight's hotel with check-in code)
- Quick actions: add expense, add itinerary item, open emergency page
- Kid variant: simplified, larger touch targets, shows "where are we today", journal prompt of the day ("מה היה הכי כיף היום?")

### 2.2 Itinerary
- Trip → days → items. Day fields include `country_code` (drives weather, emergency page, phrasebook for that day). Item fields: title, start/end time, location name + lat/lng (Google Places autocomplete), notes, linked booking, status (`planned` / `done` / `cancelled`), `shared_with_guests` flag (applies to done items shown on guest map)
- Timeline view of all days; drag to reorder items within a day; move item to another day in max two taps
- Realtime: changes by one owner appear on the other's device without refresh

### 2.3 Bookings
- Types: `flight`, `hotel`, `train`, `attraction`, `car_rental`, `other`
- Common fields: title, dates, confirmation code, cost + currency, status (`booked` / `paid` / `cancelled`), attached file (PDF/image in Storage), notes, link URL
- Type-specific fields stored in a `details` jsonb column: flight (flight number, terminal), hotel (check-in/out times, address)
- Each booking can link to itinerary days; cost auto-creates a budget expense (editable)

### 2.4 Budget
- Categories: flights, lodging, food, attractions, transport, shopping, misc (Hebrew labels in UI)
- Planned amount per category vs. actual
- Fast expense entry (target: 3 taps): amount → currency → category. Description optional
- Currency: expense stored in original currency + ILS conversion at that day's rate. Base currency ILS. **FX provider: open.er-api.com / exchangerate.host (global coverage — round-the-world trip crosses many non-ECB currencies), Frankfurter fallback, last-known-rate final fallback; rate cached daily in DB**
- Dashboard: total vs. budget, per-category bars, daily burn rate, projected end-of-trip total
- Live rates widget + quick converter

### 2.5 Documents vault (owners only)
- Upload PDF/images to Supabase Storage (private bucket), fields: title, tags (passport/insurance/vaccine/visa/other), notes
- Access via short-lived signed URLs
- "Available offline" toggle per document → file cached in IndexedDB on that device, encrypted at rest is not required (device-level security assumed), but wipe on logout
- Search by title/tag

### 2.6 Maps
- Google Maps embed: pins for all itinerary items, colored per day; saved custom pins; drawable/saved routes (stored in `routes`)
- Offline: static map snapshot image of today's area auto-cached daily; deep link to open location in the Google Maps app
- Guest map: only `done` + shared items

### 2.7 Weather
- Open-Meteo per itinerary day location, cached; shown in today view and timeline
- In-app alert if rain probability > 50% on a day with an outdoor-tagged item

### 2.7a Options bank ("בנק אפשרויות") — owners only
- A per-destination bank of candidate places (`place_options`): hotels, restaurants, attractions, activities, transport, shops. Grouped country → area, filterable by category
- Three ways in, one list out:
  - **manual** — typed in
  - **facebook** — paste the *text* of a post; an Edge Function (`extract-places`) asks Claude for structured candidates and the owner ticks which to keep. Fetching a Facebook post server-side is not possible (login wall) and scraping breaches their terms, so pasting is the supported path. The post URL is kept on each option as `source_url`
  - **ai** — saved from "מה בסביבה" (2.8), which now parks its maybe-list here instead of a separate table
- Each option carries an optional `booking_url` for actually reserving it
- Lifecycle: `option` → `shortlist` → `booked` | `rejected`. Promoting an option creates a real booking (2.3), links the two, and marks the option `booked` — the option stays in the bank as planning history rather than being consumed
- Replaces the earlier `saved_links` and `saved_recommendations`, which were two half-versions of this split by how an item was created

### 2.8 Local recommendations
- "מה בסביבה" screen: based on current GPS or selected itinerary day
- Server-side Edge Function calls Anthropic API + Google Places: kid-friendly restaurants, attractions, tips; results in Hebrew
- One-tap save of a recommendation into the itinerary or a "maybe" list

### 2.9 Kids experience
- Journal: text + mood emoji + optional photo (stored in `photos` with `journal_entry_id`, so it flows through the same approval pipeline), auto-tagged with date + location; gentle daily prompt notification on the tablet
- Photo pipeline — approval and sharing are separate:
  - Kid uploads always start `pending` (server-enforced trigger) → owner approval queue → `approved` (visible to family) or `rejected` (visible to owners only)
  - Guests see a photo only when `status='approved'` **and** an owner explicitly set `shared_with_guests=true`. Owner uploads may skip approval but still require the explicit share step — nothing is guest-visible by default (DECISIONS #5)
- Messages: one shared family wall (guests, kids, owners — see DECISIONS #15); unread badges via `message_reads`
- Pocket money: each kid has a trip allowance (set by owner); kid logs purchases, sees remaining balance with a fun progress visual; owner sees it in the budget screen as an info section (not counted in family budget totals)

### 2.10 Guest portal
- Clean read-only web page (no install): approved+shared photos by day, shared journal entries, "where we've been" map, family wall composer
- Hebrew UI

### 2.11 Checklists
- Packing lists + ad-hoc checklists (e.g. "leaving the hotel"), reusable templates (instances keep `source_template_id`), shared realtime check-off, assignable to a member

### 2.12 Emergency page
- **Per country** (keyed by `country_code`, following the itinerary): local emergency numbers, Israeli embassy contact, insurance policy details + insurer hotline, current hotel name/address/phone, blood-type/allergy notes if owners add them
- The page shown defaults to the current day's country; all countries' pages are cached offline
- Reachable in one tap from any screen (persistent icon), fully offline

### 2.13 Phrasebook
- Useful phrases **per destination language** (multi-country trip: one set per language, tagged `language` + optional `country_code`), grouped (greetings, food, emergency, transport), with "show to a local" full-screen large-text mode; works offline; content generated once per language via Anthropic API and stored

### 2.14 Notifications (Web Push)
- Weather alert (rain on outdoor day), flight check-in reminder (24h before flight booking), new message on the family wall, new photo pending approval (owners)
- Note: on iOS, Web Push requires the PWA installed to home screen (iOS 16.4+) - include install instructions screen

### 2.15 Where's the car
- One tap saves current GPS as "car/hotel" pin with optional photo; one tap navigates back via Google Maps deep link

## 3. Offline strategy
- Service Worker: app shell cached (all static assets), stale-while-revalidate for data
- IndexedDB stores: `documents_offline`, `today_itinerary`, `emergency_pages`, `phrasebook`, `pending_writes`
- Writes made offline enter `pending_writes` queue → replayed on reconnect. Conflict policy: last-write-wins (comparing `updated_at`); if server version changed since read, apply and show a toast "עודכן גם ממכשיר אחר - בדקו את הפריט"
- Clear Hebrew offline banner on non-cached screens

## 4. Out of scope (do not build)
- Memory book PDF export (data model must not block it later)
- Live flight status tracking (booking includes a manual link field instead)
- Email-forwarding booking auto-extraction (backlog, only if time remains after sprint 8)
- Multi-trip UI (schema supports multiple trips; UI assumes one active trip)

## 5. Non-functional
- Lighthouse PWA installable; app usable on 390px viewport; interactions < 100ms perceived (optimistic UI on writes)
- Photo uploads client-side compressed to max 1600px / ~300KB before upload
- Weekly automated DB backup: scheduled Edge Function exports tables to a Storage backup bucket
