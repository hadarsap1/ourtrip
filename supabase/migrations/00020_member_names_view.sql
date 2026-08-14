-- Stop leaking family email addresses to kids and guests (audit finding P-2).
--
-- `members_kid_guest_select` (00008) granted kids and active guests SELECT on
-- every members row of their trip, because the family wall has to turn a
-- sender_id into a name. RLS is row-level, so that grant necessarily carried
-- the whole row — including `email` and `auth_user_id`. Any invited guest could
-- read both owners' email addresses, the kid rows, and every OTHER guest's
-- address. The Sprint 8 role matrix counted rows per role, not columns, which
-- is why it passed.
--
-- Column-level REVOKE cannot fix this: privileges attach to the `authenticated`
-- role, and owners are `authenticated` too, so revoking `email` would blind the
-- owners as well.
--
-- Instead, name resolution moves to a view that exposes only the four columns
-- the UI actually needs, and the over-broad policy is dropped so kids and
-- guests can no longer read the `members` table at all.

-- security_invoker = false (the default) → the view body runs as its owner and
-- bypasses RLS on `members`, which is the point: kids and guests have no
-- policy there any more. The WHERE clause is what keeps it safe — rows are
-- restricted to the caller's own trip, resolved through current_member_id(),
-- which reads the request JWT and is therefore per-request. An unauthenticated
-- caller resolves to null and the subquery matches nothing.
create view public.trip_member_names
with (security_invoker = false) as
  select m.id, m.trip_id, m.display_name, m.role
  from members m
  where m.trip_id in (
    select m2.trip_id from members m2 where m2.id = public.current_member_id()
  );

alter view public.trip_member_names owner to postgres;

revoke all on public.trip_member_names from public, anon;
grant select on public.trip_member_names to authenticated;

-- The over-broad policy this replaces. Owners keep full row access through
-- members_owner_all; every member keeps their own row through
-- members_self_select (needed to resolve role before any other policy matches).
drop policy members_kid_guest_select on members;
