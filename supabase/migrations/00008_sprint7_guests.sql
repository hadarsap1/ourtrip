-- Sprint 7: guest role + family wall.
--
-- Guests (DECISIONS #5, SCHEMA RLS plan): SELECT only content explicitly
-- shared — photos approved AND shared, shared journal entries, done+shared
-- itinerary items — plus the family wall. Every guest policy goes through
-- is_active_guest_of(), which re-checks guests_allowlist.revoked_at on every
-- query: revoking a guest removes access immediately (Sprint 7 acceptance).

-- ============ HELPER ============

create or replace function public.is_active_guest_of(p_trip_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from members m
    join guests_allowlist g
      on g.trip_id = m.trip_id and lower(g.email) = lower(m.email)
    where m.id = public.current_member_id()
      and m.trip_id = p_trip_id
      and m.role = 'guest'
      and g.revoked_at is null
  );
$$;

-- ============ GUEST POLICIES (shared content only) ============

create policy trips_guest_select on trips
  for select using (public.is_active_guest_of(id));

-- guest-visible photo ⟺ status='approved' AND shared_with_guests (DECISIONS #5)
create policy photos_guest_select on photos
  for select using (
    public.is_active_guest_of(trip_id)
    and status = 'approved'
    and shared_with_guests = true
  );

create policy journal_entries_guest_select on journal_entries
  for select using (
    public.is_active_guest_of(trip_id) and shared_with_guests = true
  );

-- where-we've-been map: done + shared items only; day rows are visible only
-- when they contain at least one such item (future plans stay invisible)
create policy itinerary_items_guest_select on itinerary_items
  for select using (
    status = 'done' and shared_with_guests = true
    and exists (
      select 1 from itinerary_days d
      where d.id = itinerary_items.day_id and public.is_active_guest_of(d.trip_id)
    )
  );

create policy itinerary_days_guest_select on itinerary_days
  for select using (
    public.is_active_guest_of(trip_id)
    and exists (
      select 1 from itinerary_items i
      where i.day_id = itinerary_days.id
        and i.status = 'done' and i.shared_with_guests = true
    )
  );

-- ============ FAMILY WALL (one shared feed — DECISIONS #15) ============

create policy messages_kid_select on messages
  for select using (public.is_kid_of(trip_id));

create policy messages_kid_insert on messages
  for insert with check (
    public.is_kid_of(trip_id) and sender_id = public.current_member_id()
  );

create policy messages_guest_select on messages
  for select using (public.is_active_guest_of(trip_id));

create policy messages_guest_insert on messages
  for insert with check (
    public.is_active_guest_of(trip_id) and sender_id = public.current_member_id()
  );

-- unread tracking: every member manages their own read rows
create policy message_reads_self_all on message_reads
  for all using (member_id = public.current_member_id())
  with check (member_id = public.current_member_id());

-- sender names on the wall: kids + active guests may read the member list
-- of their own trip (owners already can)
create policy members_kid_guest_select on members
  for select using (
    public.is_kid_of(trip_id) or public.is_active_guest_of(trip_id)
  );

-- ============ REALTIME ============
-- Wall messages land live on every device (subscribers are authorized
-- against the SELECT policies above).

alter publication supabase_realtime add table public.messages;
