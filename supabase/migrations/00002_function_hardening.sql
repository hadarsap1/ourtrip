-- Hardening pass after advisor review:
-- 1. Lock search_path on set_updated_at (was mutable).
-- 2. Trigger functions never need to be callable via the REST RPC surface.
-- 3. link_member_to_auth_user is only meaningful for signed-in users.
-- NOTE: current_member_id / current_member_role / is_owner_of intentionally stay
-- executable by anon+authenticated — RLS policy expressions run them as the
-- querying role, and for anon they return null/false (no data exposure).

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.photos_enforce_kid_rules() from public, anon, authenticated;
revoke execute on function public.photos_guard_update() from public, anon, authenticated;
revoke execute on function public.link_member_to_auth_user() from public, anon;
