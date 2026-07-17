-- Sprint 7 hotfix: 00008's guest policies on itinerary_days and
-- itinerary_items referenced each other's tables directly, which Postgres
-- rejects as infinite policy recursion (days policy → items subquery →
-- items policies → days subquery → …). Because every policy on a table is
-- evaluated for every query, this broke itinerary reads for ALL roles.
-- Caught by the guest emulation probe before any client hit it.
--
-- Fix: route the cross-table lookups through SECURITY DEFINER helpers
-- (which bypass RLS, same pattern as current_member_id/is_owner_of).

create or replace function public.day_trip_id(p_day_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select trip_id from itinerary_days where id = p_day_id;
$$;

create or replace function public.day_has_guest_visible_item(p_day_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from itinerary_items i
    where i.day_id = p_day_id
      and i.status = 'done'
      and i.shared_with_guests = true
  );
$$;

drop policy itinerary_items_guest_select on itinerary_items;
create policy itinerary_items_guest_select on itinerary_items
  for select using (
    status = 'done' and shared_with_guests = true
    and public.is_active_guest_of(public.day_trip_id(day_id))
  );

drop policy itinerary_days_guest_select on itinerary_days;
create policy itinerary_days_guest_select on itinerary_days
  for select using (
    public.is_active_guest_of(trip_id)
    and public.day_has_guest_visible_item(id)
  );
