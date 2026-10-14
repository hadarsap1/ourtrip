-- Guests and kids read member NAMES, not addresses (security pass 14/10/2026).
--
-- members_kid_guest_select (00007/00008) let every kid and active guest read
-- every members row of the trip - email and auth_user_id included. With the
-- class lists invited (DECISIONS #29) that is ~50 guest email addresses any
-- one guest could list. Names are all the other roles need (who wrote a
-- comment, who liked, who is on the wall), so:
--
--   * the broad policy matches nothing any more (ALTER to false rather than
--     DROP, so the change is one non-destructive statement); kids and guests
--     keep members_self_select (their own row, which useMember needs)
--   * trip_member_names(trip) returns id / trip_id / display_name / role /
--     created_at for a trip the CALLER belongs to - security definer so it can
--     read the rows, the membership check inside is the access rule
--   * owners keep members_owner_all (they manage invitations by email)

alter policy members_kid_guest_select on members using (false);

create or replace function public.trip_member_names(p_trip_id uuid)
returns table (id uuid, trip_id uuid, display_name text, role member_role, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.trip_id, m.display_name, m.role, m.created_at
    from members m
   where m.trip_id = p_trip_id
     and (public.is_owner_of(p_trip_id) or public.is_kid_of(p_trip_id) or public.is_active_guest_of(p_trip_id))
   order by m.display_name;
$$;

revoke execute on function public.trip_member_names(uuid) from public, anon;
grant execute on function public.trip_member_names(uuid) to authenticated;
