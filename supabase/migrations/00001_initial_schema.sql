-- OurTrip — initial schema, triggers, and RLS.
-- Sprint 1 scope: full schema, RLS enabled everywhere (deny-by-default),
-- owner policies, kid/guest-ready helpers. Kid/guest policies land in
-- Sprints 6-7 but current_member() already resolves both auth flavors.

-- ============ TYPES ============

create type member_role as enum ('owner', 'kid', 'guest');
create type item_status as enum ('planned', 'done', 'cancelled');
create type booking_type as enum ('flight','hotel','train','attraction','car_rental','other');
create type booking_status as enum ('booked','paid','cancelled');
create type photo_status as enum ('pending','approved','rejected');

-- ============ TABLES ============

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
  auth_user_id uuid references auth.users(id),
  email text,
  display_name text not null,
  role member_role not null,
  created_at timestamptz not null default now(),
  unique (trip_id, email)
);

create table kid_devices (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id),
  device_token_hash text not null,
  pin_hash text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  approved_by uuid not null references members(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table itinerary_days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  date date not null,
  location_name text,
  country_code text,
  lat double precision,
  lng double precision,
  notes text,
  updated_at timestamptz not null default now(),
  unique (trip_id, date)
);

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
  file_path text,
  link_url text,
  details jsonb not null default '{}',
  notes text,
  updated_at timestamptz not null default now()
);

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
  booking_id uuid references bookings(id),
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

create table budget_categories (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  key text not null,
  label_he text not null,
  planned_amount numeric(12,2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (trip_id, key)
);

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

create table documents (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  title text not null,
  tag text not null,
  file_path text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  author_id uuid not null references members(id),
  body text not null,
  mood text,
  entry_date date not null default current_date,
  location_name text,
  shared_with_guests boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table photos (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  uploaded_by uuid not null references members(id),
  journal_entry_id uuid references journal_entries(id),
  file_path text not null,
  caption text,
  taken_on date not null default current_date,
  status photo_status not null default 'pending',
  shared_with_guests boolean not null default false,
  approved_by uuid references members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  sender_id uuid not null references members(id),
  body text not null,
  created_at timestamptz not null default now()
);

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
  revoked_at timestamptz,
  primary key (trip_id, email)
);

create table map_pins (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  label text not null,
  kind text not null default 'custom',
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
  day_id uuid references itinerary_days(id),
  name text not null,
  path jsonb not null default '[]',
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
  source_template_id uuid references checklists(id),
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

create table emergency_info (
  trip_id uuid not null references trips(id),
  country_code text not null,
  content jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (trip_id, country_code)
);

create table phrasebook_entries (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  language text not null,
  country_code text,
  category text not null,
  phrase_he text not null,
  phrase_local text not null,
  phonetic_he text
);

-- ============ AUTH HELPERS ============
-- current_member() resolves BOTH auth flavors from day one:
--   * regular Supabase auth users (owners, guests)  → members.auth_user_id = auth.uid()
--   * kid device sessions (Sprint 6) → Edge Function mints a JWT carrying a
--     'member_id' claim → matched here.
-- security definer so policy checks don't recurse into members' own RLS.

create or replace function public.current_member_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select m.id from members m
  where (auth.uid() is not null and m.auth_user_id = auth.uid())
     or (nullif(auth.jwt()->>'member_id','') is not null
         and m.id = (auth.jwt()->>'member_id')::uuid)
  limit 1;
$$;

create or replace function public.current_member_role()
returns member_role
language sql stable security definer set search_path = public
as $$
  select m.role from members m where m.id = public.current_member_id();
$$;

create or replace function public.is_owner_of(p_trip_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from members m
    where m.id = public.current_member_id()
      and m.trip_id = p_trip_id
      and m.role = 'owner'
  );
$$;

-- Called by the client right after OAuth login: links the auth user to its
-- pre-seeded members row by email (RLS would block a direct update, since the
-- user isn't resolvable as a member until the link exists). Returns the
-- member's role, or null → the account is not allowed and must be signed out.
create or replace function public.link_member_to_auth_user()
returns member_role
language plpgsql security definer set search_path = public
as $$
declare r member_role;
begin
  if auth.uid() is null then
    return null;
  end if;

  update members
     set auth_user_id = auth.uid()
   where auth_user_id is null
     and email is not null
     and lower(email) = lower(coalesce(auth.jwt()->>'email',''));

  select role into r from members where auth_user_id = auth.uid() limit 1;
  return r;
end;
$$;

-- ============ TRIGGERS ============

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'itinerary_days','itinerary_items','bookings','budget_categories','expenses',
    'documents','journal_entries','photos','map_pins','routes','checklists',
    'checklist_items','pocket_money','pocket_expenses','emergency_info'
  ] loop
    execute format(
      'create trigger %I before update on %I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end;
$$;

-- DECISIONS #4 + #5: kid uploads are ALWAYS pending and never guest-shared,
-- regardless of what the client sends. Sharing with guests is owner-only.
create or replace function public.photos_enforce_kid_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare uploader_role member_role;
begin
  select role into uploader_role from members where id = new.uploaded_by;
  if uploader_role = 'kid' then
    new.status := 'pending';
    new.shared_with_guests := false;
    new.approved_by := null;
  end if;
  return new;
end;
$$;

create trigger photos_before_insert
  before insert on photos
  for each row execute function public.photos_enforce_kid_rules();

-- Kids can never flip sharing/approval on update either.
create or replace function public.photos_guard_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.current_member_role() = 'kid' then
    new.status := old.status;
    new.shared_with_guests := old.shared_with_guests;
    new.approved_by := old.approved_by;
  end if;
  return new;
end;
$$;

create trigger photos_before_update
  before update on photos
  for each row execute function public.photos_guard_update();

-- ============ RLS: ENABLE EVERYWHERE (deny-by-default) ============

do $$
declare t text;
begin
  foreach t in array array[
    'trips','members','kid_devices','itinerary_days','itinerary_items','bookings',
    'budget_categories','fx_rates','expenses','documents','journal_entries','photos',
    'messages','message_reads','guests_allowlist','map_pins','routes','checklists',
    'checklist_items','pocket_money','pocket_expenses','emergency_info','phrasebook_entries'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end;
$$;

-- ============ SPRINT 1 POLICIES: owners only ============
-- Kid policies land in Sprint 6, guest policies in Sprint 7.
-- With only these policies, anonymous access to every table returns zero rows.

-- members: a logged-in user may read their own row (needed to resolve role
-- before any other policy can match).
create policy members_self_select on members
  for select using (
    auth_user_id = auth.uid()
    or id = public.current_member_id()
  );

create policy members_owner_all on members
  for all using (public.is_owner_of(trip_id))
  with check (public.is_owner_of(trip_id));

create policy trips_owner_all on trips
  for all using (public.is_owner_of(id))
  with check (public.is_owner_of(id));

-- fx_rates has no trip scope: any authenticated family member may read;
-- writes happen via service role (scheduled Edge Function).
create policy fx_rates_member_select on fx_rates
  for select using (public.current_member_id() is not null);

-- kid_devices / checklist_items / message_reads join through their parent.
create policy kid_devices_owner_all on kid_devices
  for all using (
    exists (select 1 from members m where m.id = kid_devices.member_id and public.is_owner_of(m.trip_id))
  ) with check (
    exists (select 1 from members m where m.id = kid_devices.member_id and public.is_owner_of(m.trip_id))
  );

create policy checklist_items_owner_all on checklist_items
  for all using (
    exists (select 1 from checklists c where c.id = checklist_items.checklist_id and public.is_owner_of(c.trip_id))
  ) with check (
    exists (select 1 from checklists c where c.id = checklist_items.checklist_id and public.is_owner_of(c.trip_id))
  );

create policy itinerary_items_owner_all on itinerary_items
  for all using (
    exists (select 1 from itinerary_days d where d.id = itinerary_items.day_id and public.is_owner_of(d.trip_id))
  ) with check (
    exists (select 1 from itinerary_days d where d.id = itinerary_items.day_id and public.is_owner_of(d.trip_id))
  );

create policy message_reads_owner_all on message_reads
  for all using (
    exists (select 1 from members m where m.id = message_reads.member_id and public.is_owner_of(m.trip_id))
  ) with check (member_id = public.current_member_id());

-- All remaining trip-scoped tables: straightforward owner-only policies.
do $$
declare t text;
begin
  foreach t in array array[
    'itinerary_days','bookings','budget_categories','expenses','documents',
    'journal_entries','photos','messages','guests_allowlist','map_pins','routes',
    'checklists','pocket_money','pocket_expenses','emergency_info','phrasebook_entries'
  ] loop
    execute format(
      'create policy %I on %I for all using (public.is_owner_of(trip_id)) with check (public.is_owner_of(trip_id))',
      t || '_owner_all', t
    );
  end loop;
end;
$$;
