-- OurTrip - Draft schema (starting point for the first migration)
-- Claude Code: refine as needed, but keep table names, roles model, and RLS approach.
-- Every table: RLS ENABLED. No table is accessible without a policy.
--
-- Revision 2 (2026-07-16): applied kickoff-review fixes —
--   * photos: separate `shared_with_guests` from approval `status` (approval ≠ sharing)
--   * photos: optional link to a journal entry
--   * messages: kept as one shared family wall (see DECISIONS #15) + per-member read tracking
--   * added `routes` table (was in SPEC/DEV-PLAN but missing here)
--   * `updated_at` on every user-editable table (required by last-write-wins conflict policy)
--   * guests_allowlist: PK (trip_id, email) + revoked_at
--   * itinerary_days: unique (trip_id, date)
--   * pocket_money / pocket_expenses: added trip_id
--   * members: unique (trip_id, email)
--   * checklists: link instantiated list back to its template
--   * phrasebook per language, emergency info per country (multi-country trip)

-- ============ CORE ============

create type member_role as enum ('owner', 'kid', 'guest');

create table trips (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date,
  end_date date,
  base_currency text not null default 'ILS',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  auth_user_id uuid references auth.users(id), -- null for kid profiles
  email text,                                  -- owners + guests
  display_name text not null,
  role member_role not null,
  created_at timestamptz not null default now(),
  unique (trip_id, email)
);

-- Kid device registration: owner-created token bound to a device
create table kid_devices (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id), -- the kid profile
  device_token_hash text not null,
  pin_hash text not null,
  failed_attempts int not null default 0,         -- PIN rate limiting
  locked_until timestamptz,
  approved_by uuid not null references members(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- ============ ITINERARY ============

create table itinerary_days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  date date not null,
  location_name text,
  country_code text, -- ISO 3166-1 alpha-2; drives weather, emergency page, phrasebook
  lat double precision,
  lng double precision,
  notes text,
  updated_at timestamptz not null default now(),
  unique (trip_id, date)
);

create type item_status as enum ('planned', 'done', 'cancelled');

create table itinerary_items (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references itinerary_days(id),
  title text not null,
  start_time time,
  end_time time,
  location_name text,
  lat double precision,
  lng double precision,
  place_id text,
  notes text,
  is_outdoor boolean not null default false,
  status item_status not null default 'planned',
  shared_with_guests boolean not null default false,
  booking_id uuid, -- fk added after bookings table
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

-- ============ BOOKINGS & BUDGET ============

create type booking_type as enum ('flight','hotel','train','attraction','car_rental','other');
create type booking_status as enum ('booked','paid','cancelled');

create table bookings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  type booking_type not null,
  title text not null,
  start_date date,
  end_date date,
  confirmation_code text,
  cost numeric(12,2),
  currency text,
  status booking_status not null default 'booked',
  file_path text, -- Supabase Storage path
  link_url text,
  details jsonb not null default '{}',
  notes text,
  updated_at timestamptz not null default now()
);

alter table itinerary_items
  add constraint itinerary_items_booking_fk
  foreign key (booking_id) references bookings(id);

create table budget_categories (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  key text not null, -- flights/lodging/food/...
  label_he text not null,
  planned_amount numeric(12,2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (trip_id, key)
);

-- FX: primary provider open.er-api.com / exchangerate.host (global coverage, ~160 currencies),
-- fallback Frankfurter (ECB, ~30 currencies), final fallback = last known rate in this table.
create table fx_rates (
  day date not null,
  currency text not null,
  rate_to_ils numeric(12,6) not null,
  primary key (day, currency)
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  category_id uuid not null references budget_categories(id),
  amount numeric(12,2) not null,
  currency text not null,
  amount_ils numeric(12,2) not null,
  description text,
  spent_on date not null default current_date,
  booking_id uuid references bookings(id),
  created_by uuid not null references members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ DOCUMENTS (OWNERS ONLY) ============

create table documents (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  title text not null,
  tag text not null, -- passport/insurance/vaccine/visa/other
  file_path text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ KIDS & SHARING ============

create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  author_id uuid not null references members(id),
  body text not null,
  mood text, -- emoji
  entry_date date not null default current_date,
  location_name text,
  shared_with_guests boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type photo_status as enum ('pending','approved','rejected');

-- Approval and sharing are SEPARATE axes (DECISIONS #5):
--   status          = parental approval pipeline (kid uploads always start 'pending')
--   shared_with_guests = explicit opt-in to guest visibility (default false, even for owners)
-- Guest-visible  ⟺  status = 'approved' AND shared_with_guests = true.
create table photos (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  uploaded_by uuid not null references members(id),
  journal_entry_id uuid references journal_entries(id), -- optional: photo attached to a journal post
  file_path text not null,
  caption text,
  taken_on date not null default current_date,
  status photo_status not null default 'pending',
  shared_with_guests boolean not null default false,
  approved_by uuid references members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- RULE: owner uploads may default to 'approved'; kid uploads ALWAYS start 'pending'
-- (enforced by trigger, see below). Sharing with guests is a second, explicit step.

-- One shared family wall: owners + kids + guests all read the same feed (DECISIONS #15).
create table messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  sender_id uuid not null references members(id),
  body text not null,
  created_at timestamptz not null default now()
);

-- Per-member read tracking → unread badges + "new message" push
create table message_reads (
  message_id uuid not null references messages(id),
  member_id uuid not null references members(id),
  read_at timestamptz not null default now(),
  primary key (message_id, member_id)
);

create table guests_allowlist (
  trip_id uuid not null references trips(id),
  email text not null,
  invited_by uuid not null references members(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz, -- revoking a guest = set revoked_at; policies must check it
  primary key (trip_id, email)
);

-- ============ MAPS, LISTS, MISC ============

create table map_pins (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  label text not null,
  kind text not null default 'custom', -- custom / car / hotel
  lat double precision not null,
  lng double precision not null,
  photo_path text,
  created_by uuid not null references members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table routes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  day_id uuid references itinerary_days(id), -- optional: route belongs to a day
  name text not null,
  path jsonb not null default '[]', -- array of [lat,lng] points
  color text,
  created_by uuid not null references members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table checklists (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  title text not null,
  is_template boolean not null default false,
  source_template_id uuid references checklists(id), -- which template this was created from
  updated_at timestamptz not null default now()
);

create table checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references checklists(id),
  label text not null,
  assigned_to uuid references members(id),
  checked boolean not null default false,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

create table pocket_money (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  kid_id uuid not null references members(id),
  allowance numeric(10,2) not null,
  currency text not null default 'ILS',
  updated_at timestamptz not null default now(),
  unique (trip_id, kid_id)
);

create table pocket_expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  kid_id uuid not null references members(id),
  amount numeric(10,2) not null,
  description text,
  spent_on date not null default current_date,
  updated_at timestamptz not null default now()
);

-- Multi-country trip: one emergency page per country, keyed by country_code.
create table emergency_info (
  trip_id uuid not null references trips(id),
  country_code text not null, -- ISO 3166-1 alpha-2
  content jsonb not null default '{}', -- structured: numbers, embassy, insurance, hotel, medical notes
  updated_at timestamptz not null default now(),
  primary key (trip_id, country_code)
);

-- Multi-country trip: phrasebook entries carry their target language.
create table phrasebook_entries (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  language text not null,     -- e.g. 'ja', 'th', 'es'
  country_code text,          -- optional link to the country it was generated for
  category text not null,
  phrase_he text not null,
  phrase_local text not null,
  phonetic_he text
);

-- ============ TRIGGERS (implement in the first migration) ============
-- 1. set_updated_at(): before update on every table with updated_at → new.updated_at = now().
--    Required by the last-write-wins conflict policy (DECISIONS #10).
-- 2. photos_before_insert: if uploader role = 'kid' then status := 'pending' AND
--    shared_with_guests := false, regardless of client input (DECISIONS #4).
-- 3. kid writes never set shared_with_guests = true on any table (sharing is owner-only).

-- ============ RLS APPROACH (implement fully in migrations) ============
-- Helper: current_member() resolves auth.uid() OR kid device token (via edge function JWT claim)
--         to a members row. MUST be designed in Sprint 1 to handle both auth flavors,
--         otherwise every policy gets rewritten in Sprint 6.
--
-- owners: full access to all tables scoped to their trip.
-- kids:   SELECT itinerary_days/items (read-only), weather-relevant data,
--         own journal_entries (ALL), photos: INSERT (forced pending via trigger) + SELECT family-visible,
--         messages: SELECT + INSERT, message_reads: own rows, pocket_*: own rows,
--         phrasebook/emergency: SELECT. NO access: documents, expenses, bookings, budget_categories.
-- guests: (allowlist row must have revoked_at IS NULL)
--         SELECT only where shared_with_guests = true (journal, done itinerary items),
--         photos where status = 'approved' AND shared_with_guests = true,
--         messages SELECT + INSERT, message_reads: own rows.
--         NO access to everything else.
--
-- Storage buckets: documents (owners only), booking-files (owners only),
--                  photos (family read; guest read only via signed URLs issued for
--                  approved+shared photos by an Edge Function that re-checks both flags).
