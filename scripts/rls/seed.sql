-- Probe fixture: one trip, one of each role, and helpers to act as them.
-- Included by every probe (\i scripts/rls/seed.sql) inside its own
-- transaction, so nothing persists between probes.

create schema if not exists rls;
grant usage on schema rls to anon, authenticated;

create or replace function rls.check(label text, ok boolean) returns void
language plpgsql as $$
begin
  if ok then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label;
  end if;
end $$;
grant execute on function rls.check(text, boolean) to anon, authenticated;

-- fixed ids so probes can refer to rows by name
insert into trips (id, name) values ('00000000-0000-0000-0000-0000000000a1', 'probe');
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000aa01', 'owner@probe.test'),
  ('00000000-0000-0000-0000-00000000aa03', 'guest@probe.test'),
  ('00000000-0000-0000-0000-00000000aa04', 'gone@probe.test'),
  ('00000000-0000-0000-0000-00000000aa05', 'outsider@probe.test');
insert into members (id, trip_id, auth_user_id, email, display_name, role) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000aa01', 'owner@probe.test', 'Owner', 'owner'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1', null, null, 'Kid', 'kid'),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000aa03', 'guest@probe.test', 'Guest', 'guest'),
  ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000aa04', 'gone@probe.test', 'Revoked', 'guest');
insert into guests_allowlist (trip_id, email, invited_by, revoked_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'guest@probe.test', '00000000-0000-0000-0000-0000000000b1', null),
  ('00000000-0000-0000-0000-0000000000a1', 'gone@probe.test', '00000000-0000-0000-0000-0000000000b1', now());
-- kid sessions authenticate with a device JWT carrying member_id; the
-- device row must be live for current_member_id() to resolve it (00024)
insert into kid_devices (member_id, device_token_hash, pin_hash, approved_by) values
  ('00000000-0000-0000-0000-0000000000b2', 'x', 'x', '00000000-0000-0000-0000-0000000000b1');

insert into photos (id, trip_id, uploaded_by, file_path, status, shared_with_guests) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'p/shared.jpg', 'approved', true),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'p/unshared.jpg', 'approved', false);

-- identity switchers (call after `set local role ...`)
create or replace function rls.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000aa01","email":"owner@probe.test","role":"authenticated"}', true) $$;
create or replace function rls.as_kid() returns void language sql as $$
  select set_config('request.jwt.claims', '{"member_id":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true) $$;
create or replace function rls.as_guest() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000aa03","email":"guest@probe.test","role":"authenticated"}', true) $$;
create or replace function rls.as_revoked() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000aa04","email":"gone@probe.test","role":"authenticated"}', true) $$;
create or replace function rls.as_outsider() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000aa05","email":"outsider@probe.test","role":"authenticated"}', true) $$;
create or replace function rls.as_anon() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"anon"}', true) $$;
grant execute on all functions in schema rls to anon, authenticated;
