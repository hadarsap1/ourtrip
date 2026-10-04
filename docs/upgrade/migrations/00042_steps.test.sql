-- Local RLS test for 00042 (stub schema, run from repo root on a scratch Postgres).
-- Expected results are in the \echo lines.
\set ON_ERROR_STOP 0
create role anon; create role authenticated;
create extension if not exists pgcrypto;
create type member_role as enum ('owner','kid','guest');
create table members (id uuid primary key, trip_id uuid, role member_role);
create function public.current_member_id() returns uuid language sql stable as $$ select nullif(current_setting('t.me', true), '')::uuid $$;
create function public.current_member_role() returns member_role language sql stable security definer set search_path = public as $$ select m.role from members m where m.id = public.current_member_id() $$;
create function public.is_owner_of(p uuid) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from members m where m.id = public.current_member_id() and m.trip_id = p and m.role = 'owner') $$;
insert into members values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','owner'),('aaaaaaaa-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','owner'),('aaaaaaaa-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','kid'),('aaaaaaaa-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','guest'),('aaaaaaaa-0000-0000-0000-000000000005','22222222-2222-2222-2222-222222222222','owner');
\i supabase/migrations/00042_steps.sql
insert into daily_steps values ('aaaaaaaa-0000-0000-0000-000000000001','2026-11-01',12000),('aaaaaaaa-0000-0000-0000-000000000002','2026-11-01',9000),('aaaaaaaa-0000-0000-0000-000000000005','2026-11-01',5000);
insert into step_tokens (member_id, token_hash, label) values ('aaaaaaaa-0000-0000-0000-000000000001', repeat('a',64), 'iPhone הדר');
grant select, insert, update, delete on daily_steps, step_tokens to authenticated; grant select on members to authenticated;
set role authenticated;
\echo '--- owner A sees (expect 2 steps rows, 1 token)'
set t.me = 'aaaaaaaa-0000-0000-0000-000000000001'; select count(*) from daily_steps; select count(*) from step_tokens;
\echo '--- owner B sees A too (expect 2, 1) and can revoke A token (expect UPDATE 1)'
set t.me = 'aaaaaaaa-0000-0000-0000-000000000002'; select count(*) from daily_steps; select count(*) from step_tokens; update step_tokens set revoked_at = now();
\echo '--- B cannot create a token for A (expect error)'
insert into step_tokens (member_id, token_hash) values ('aaaaaaaa-0000-0000-0000-000000000001', repeat('b',64));
\echo '--- B creates own token (expect INSERT)'
insert into step_tokens (member_id, token_hash) values ('aaaaaaaa-0000-0000-0000-000000000002', repeat('c',64));
\echo '--- kid sees nothing, cannot write (expect 0, 0, error, error)'
set t.me = 'aaaaaaaa-0000-0000-0000-000000000003'; select count(*) from daily_steps; select count(*) from step_tokens;
insert into daily_steps values ('aaaaaaaa-0000-0000-0000-000000000003','2026-11-02',100);
insert into step_tokens (member_id, token_hash) values ('aaaaaaaa-0000-0000-0000-000000000003', repeat('d',64));
\echo '--- guest sees nothing (expect 0, 0)'
set t.me = 'aaaaaaaa-0000-0000-0000-000000000004'; select count(*) from daily_steps; select count(*) from step_tokens;
\echo '--- other trip owner X sees only own (expect 1, 0) and cannot write into trip 1 (expect error)'
set t.me = 'aaaaaaaa-0000-0000-0000-000000000005'; select count(*) from daily_steps; select count(*) from step_tokens;
insert into daily_steps values ('aaaaaaaa-0000-0000-0000-000000000001','2026-11-03',1);
\echo '--- anon has no grant (expect permission denied)'
reset role; set role anon; select count(*) from daily_steps;
reset role;
\echo '--- checks: bad hash, steps out of range (expect 2 errors)'
insert into step_tokens (member_id, token_hash) values ('aaaaaaaa-0000-0000-0000-000000000001', 'nothex');
insert into daily_steps values ('aaaaaaaa-0000-0000-0000-000000000001','2026-11-09',300000);
