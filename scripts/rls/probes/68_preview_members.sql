-- 00068: "view as". The test guest and test kid are ordinary members of their
-- role: they see exactly what that role sees (groups included), and is_preview
-- changes nothing about access. Rows are created the way preview-session
-- does it (service role).
begin;
\i scripts/rls/seed.sql

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000aa07', 'preview-guest-x@preview.ourtrip.app'),
  ('00000000-0000-0000-0000-00000000aa08', 'preview-kid-x@preview.ourtrip.app');
insert into members (id, trip_id, auth_user_id, email, display_name, role, is_preview) values
  ('00000000-0000-0000-0000-0000000000b7', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000aa07', 'preview-guest-x@preview.ourtrip.app', '🧪 אורח בדיקה', 'guest', true),
  ('00000000-0000-0000-0000-0000000000b8', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000aa08', null, '🧪 ילד בדיקה', 'kid', true);
insert into guests_allowlist (trip_id, email, invited_by, labels) values
  ('00000000-0000-0000-0000-0000000000a1', 'preview-guest-x@preview.ourtrip.app', '00000000-0000-0000-0000-0000000000b1', array['כיתה עומר']);

create or replace function rls.as_preview_guest() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000aa07","email":"preview-guest-x@preview.ourtrip.app","role":"authenticated"}', true) $$;
create or replace function rls.as_preview_kid() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000aa08","email":"preview-kid-x@preview.ourtrip.app","role":"authenticated"}', true) $$;
grant execute on all functions in schema rls to anon, authenticated;

set local role authenticated; select rls.as_owner();
insert into messages (id, trip_id, sender_id, body, channel, audience) values
  ('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'omer class', 'guests', array['כיתה עומר']),
  ('00000000-0000-0000-0000-000000000a02', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'ella class', 'guests', array['כיתה אלה']);
reset role;

-- ---- the test guest is a guest, in the groups the parent picked ----
set local role authenticated; select rls.as_preview_guest();
select rls.check('test guest: resolves as a guest', public.current_member_role() = 'guest');
select rls.check('test guest: sees its own group''s message',
  exists (select 1 from messages where id = '00000000-0000-0000-0000-000000000a01'));
select rls.check('test guest: does not see another group''s message',
  not exists (select 1 from messages where id = '00000000-0000-0000-0000-000000000a02'));
select rls.check('test guest: no unshared photo (#5 holds)',
  not exists (select 1 from photos where id = '00000000-0000-0000-0000-0000000000c2'));
select rls.check('test guest: no documents, no budget',
  not exists (select 1 from documents) and not exists (select 1 from expenses));
select rls.check('test guest: no member emails', (select count(*) from members) = 1);
reset role;

-- entering again with other groups changes what it sees
update guests_allowlist set labels = array['כיתה אלה'] where email = 'preview-guest-x@preview.ourtrip.app';
set local role authenticated; select rls.as_preview_guest();
select rls.check('test guest: after a switch of groups, sees the other class',
  exists (select 1 from messages where id = '00000000-0000-0000-0000-000000000a02')
  and not exists (select 1 from messages where id = '00000000-0000-0000-0000-000000000a01'));
reset role;

-- ---- the test kid needs a device binding like any kid (00024) ----
set local role authenticated; select rls.as_preview_kid();
select rls.check('test kid: without a device it resolves as nobody', public.current_member_id() is null);
reset role;
insert into kid_devices (member_id, device_token_hash, pin_hash, approved_by) values
  ('00000000-0000-0000-0000-0000000000b8', 'unknown', 'x:y', '00000000-0000-0000-0000-0000000000b1');
set local role authenticated; select rls.as_preview_kid();
select rls.check('test kid: with the binding, resolves as a kid', public.current_member_role() = 'kid');
select rls.check('test kid: no documents, budget or guest list',
  not exists (select 1 from expenses) and not exists (select 1 from guests_allowlist));
reset role;

-- ---- one test member per role per trip ----
do $$ begin
  insert into members (trip_id, display_name, role, is_preview)
  values ('00000000-0000-0000-0000-0000000000a1', 'second', 'guest', true);
  raise exception 'FAIL  a second test guest was accepted';
exception when unique_violation then raise notice 'PASS  one test guest per trip';
end $$;

-- ---- a guest cannot mark themselves (or anyone) as a test member ----
set local role authenticated; select rls.as_guest();
update members set is_preview = true where id = '00000000-0000-0000-0000-0000000000b3';
reset role;
select rls.check('guest: cannot set is_preview',
  not (select is_preview from members where id = '00000000-0000-0000-0000-0000000000b3'));

rollback;
