-- Sprint 6: kid role — RLS policies, device registration, photos storage.
--
-- Implements the kid slice of the RLS plan at the bottom of docs/SCHEMA.sql:
-- kids read itinerary/phrasebook/emergency/trip, own journal + pocket money,
-- photos insert (forced pending by the 00001 trigger) + family-visible select.
-- Kids get NO policy on documents, expenses, bookings, budget_categories —
-- deny-by-default keeps them at zero rows (CLAUDE.md hard rule #2).

-- ============ HELPER ============

create or replace function public.is_kid_of(p_trip_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from members m
    where m.id = public.current_member_id()
      and m.trip_id = p_trip_id
      and m.role = 'kid'
  );
$$;

-- ============ DEVICE REGISTRATION ============

-- One-time codes the owner generates; the tablet redeems one to bind a
-- device (kid-auth Edge Function). PIN hash is set at generation time.
create table kid_device_registrations (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id),
  code_hash text not null,
  pin_hash text not null,
  created_by uuid not null references members(id),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table kid_device_registrations enable row level security;

create policy kid_device_registrations_owner_all on kid_device_registrations
  for all using (
    exists (select 1 from members m where m.id = kid_device_registrations.member_id and public.is_owner_of(m.trip_id))
  ) with check (
    exists (select 1 from members m where m.id = kid_device_registrations.member_id and public.is_owner_of(m.trip_id))
  );

-- ============ KID POLICIES ============

create policy trips_kid_select on trips
  for select using (public.is_kid_of(id));

create policy itinerary_days_kid_select on itinerary_days
  for select using (public.is_kid_of(trip_id));

create policy itinerary_items_kid_select on itinerary_items
  for select using (
    exists (select 1 from itinerary_days d where d.id = itinerary_items.day_id and public.is_kid_of(d.trip_id))
  );

-- own journal, full control (owner read comes from journal_entries_owner_all)
create policy journal_entries_kid_own_all on journal_entries
  for all using (
    author_id = public.current_member_id() and public.is_kid_of(trip_id)
  ) with check (
    author_id = public.current_member_id() and public.is_kid_of(trip_id)
  );

-- photos: family-visible select, insert as self (00001 trigger forces
-- pending + unshared for kid uploads), update own (caption only — the
-- photos_guard_update trigger freezes status/shared/approved for kids)
create policy photos_kid_select on photos
  for select using (public.is_kid_of(trip_id));

create policy photos_kid_insert on photos
  for insert with check (
    public.is_kid_of(trip_id) and uploaded_by = public.current_member_id()
  );

create policy photos_kid_update_own on photos
  for update using (
    public.is_kid_of(trip_id) and uploaded_by = public.current_member_id()
  ) with check (uploaded_by = public.current_member_id());

create policy pocket_money_kid_select on pocket_money
  for select using (kid_id = public.current_member_id());

create policy pocket_expenses_kid_all on pocket_expenses
  for all using (kid_id = public.current_member_id())
  with check (
    kid_id = public.current_member_id() and public.is_kid_of(trip_id)
  );

create policy phrasebook_entries_kid_select on phrasebook_entries
  for select using (public.is_kid_of(trip_id));

create policy emergency_info_kid_select on emergency_info
  for select using (public.is_kid_of(trip_id));

-- ============ JOURNAL GUARD (SCHEMA trigger rule #3) ============
-- Kid writes never set shared_with_guests = true; sharing is owner-only.

create or replace function public.journal_guard_kid()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.current_member_role() = 'kid' then
    if tg_op = 'INSERT' then
      new.shared_with_guests := false;
    else
      new.shared_with_guests := old.shared_with_guests;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.journal_guard_kid() from public, anon, authenticated;

create trigger journal_before_write
  before insert or update on journal_entries
  for each row execute function public.journal_guard_kid();

-- ============ STORAGE: photos (family) ============
-- Owners + kids read and upload; moderation (update/delete) is owner-only.
-- Guests NEVER read this bucket directly — Sprint 7 serves approved+shared
-- photos via an Edge Function that re-checks both flags (SCHEMA bucket plan).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photos',
  'photos',
  false,
  10 * 1024 * 1024, -- 10MB (client compresses to ~300KB, DECISIONS #11)
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do nothing;

create policy photos_bucket_family_select on storage.objects
  for select using (
    bucket_id = 'photos' and public.current_member_role() in ('owner','kid')
  );

create policy photos_bucket_family_insert on storage.objects
  for insert with check (
    bucket_id = 'photos' and public.current_member_role() in ('owner','kid')
  );

create policy photos_bucket_owner_update on storage.objects
  for update using (
    bucket_id = 'photos' and public.current_member_role() = 'owner'
  ) with check (
    bucket_id = 'photos' and public.current_member_role() = 'owner'
  );

create policy photos_bucket_owner_delete on storage.objects
  for delete using (
    bucket_id = 'photos' and public.current_member_role() = 'owner'
  );
