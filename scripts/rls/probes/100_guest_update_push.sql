-- 00100: guest_update_pushes is push-send's own record of what guests were
-- told. No role reads or writes it through the API - not even a parent - and a
-- guest keeps managing only their own device subscription.
begin;
\i scripts/rls/seed.sql

insert into guest_update_pushes (target_id, kind, trip_id) values
  ('00000000-0000-0000-0000-0000000100d1', 'story', '00000000-0000-0000-0000-0000000000a1');

do $$ begin
  set local role authenticated; perform rls.as_owner();
  perform count(*) from guest_update_pushes;
  raise notice 'FAIL  owner: read guest_update_pushes';
exception when insufficient_privilege then raise notice 'PASS  owner: does not read guest_update_pushes';
end $$;
reset role;

do $$ begin
  set local role authenticated; perform rls.as_guest();
  perform count(*) from guest_update_pushes;
  raise notice 'FAIL  guest: read guest_update_pushes';
exception when insufficient_privilege then raise notice 'PASS  guest: does not read guest_update_pushes';
end $$;
reset role;

set local role authenticated; select rls.as_guest();
-- turning push on: a guest stores their own device, and only their own
insert into push_subscriptions (member_id, endpoint, p256dh, auth)
values ('00000000-0000-0000-0000-0000000000b3', 'https://push.probe/guest-100', 'k', 'a');
select rls.check('guest: stores their own push subscription',
  (select count(*) from push_subscriptions where endpoint = 'https://push.probe/guest-100') = 1);
reset role;

do $$ begin
  set local role authenticated; perform rls.as_guest();
  insert into guest_update_pushes (target_id, kind, trip_id)
  values (gen_random_uuid(), 'story', '00000000-0000-0000-0000-0000000000a1');
  raise notice 'FAIL  guest: marked an update as told';
exception when insufficient_privilege then raise notice 'PASS  guest: cannot mark an update as told';
end $$;
reset role;

do $$ begin
  set local role authenticated; perform rls.as_guest();
  insert into push_subscriptions (member_id, endpoint, p256dh, auth)
  values ('00000000-0000-0000-0000-0000000000b1', 'https://push.probe/forged-100', 'k', 'a');
  raise notice 'FAIL  guest: stored a subscription for a parent';
exception when insufficient_privilege then raise notice 'PASS  guest: cannot store a subscription for a parent';
end $$;
reset role;

do $$ begin
  set local role authenticated; perform rls.as_kid();
  perform count(*) from guest_update_pushes;
  raise notice 'FAIL  kid: read guest_update_pushes';
exception when insufficient_privilege then raise notice 'PASS  kid: does not read guest_update_pushes';
end $$;
reset role;

select rls.check('anon: no privilege on guest_update_pushes',
  not has_table_privilege('anon', 'public.guest_update_pushes', 'select'));
select rls.check('authenticated: no privilege on guest_update_pushes',
  not has_table_privilege('authenticated', 'public.guest_update_pushes', 'insert'));

rollback;
