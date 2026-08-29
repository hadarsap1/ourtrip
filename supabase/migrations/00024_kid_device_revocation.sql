-- Make kid device revocation real (security review 2026-08, finding H1).
--
-- THE BUG. `kid_devices.revoked_at` was read in exactly one place — the
-- `unlock` branch of the kid-auth Edge Function — and by NO policy. Once a
-- session existed it no longer passed through that branch, so pressing
-- "revoke device" in the owner UI changed a timestamp and nothing else: the
-- tablet kept reading and writing as before. Only re-registering a device
-- (which rotates the kid's auth password) actually cut access.
--
-- Compare guests, where the same idea was implemented correctly:
-- `is_active_guest_of()` re-checks `guests_allowlist.revoked_at` on every
-- query, which is why revoking a guest is immediate.
--
-- THE FIX. Enforce it at the single point where a caller becomes a member.
-- `current_member_id()` is the root of every policy in the schema — directly,
-- or through `current_member_role()` / `is_kid_of()` / `is_owner_of()`, and
-- for storage objects too. Denying resolution here denies everything at once,
-- with no policy left to audit individually.
--
-- Doing it here rather than in `is_kid_of()` is deliberate: several policies
-- match on `current_member_id()` WITHOUT also calling `is_kid_of()` —
-- `pocket_money_kid_select`, the USING clause of `pocket_expenses_kid_all`,
-- `message_reads_self_all`, `push_subscriptions_self_all`,
-- `members_self_select`. Patching only `is_kid_of()` would have left a
-- revoked kid still reading their pocket money.
--
-- Owners and guests are untouched: the new condition applies only to
-- `role = 'kid'`. A kid with no device row at all (never registered) also
-- stops resolving, which is correct — there is no way for them to hold a
-- legitimate session.

create or replace function public.current_member_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select m.id from members m
  where ((auth.uid() is not null and m.auth_user_id = auth.uid())
      or (nullif(auth.jwt()->>'member_id','') is not null
          and m.id = (auth.jwt()->>'member_id')::uuid))
    -- a kid resolves only while an un-revoked device binding exists, so
    -- revoking a device cuts access on the very next query
    and (
      m.role <> 'kid'
      or exists (
        select 1 from kid_devices d
        where d.member_id = m.id and d.revoked_at is null
      )
    )
  limit 1;
$$;

comment on function public.current_member_id() is
  'Resolves the calling session to a members row. Kids additionally require an '
  'active (un-revoked) kid_devices binding — this is what makes device '
  'revocation effective, since every policy in the schema resolves through '
  'this function. See migration 00024.';

-- current_member_id() runs for every policy evaluation on every query, so the
-- new EXISTS needs to be an index hit, not a scan.
create index if not exists idx_kid_devices_active
  on kid_devices(member_id) where revoked_at is null;
