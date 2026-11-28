-- 00111: one friend, a separate chat with each of two kids. Each kid reads
-- only their own chat; the friend reads both; parents add, close one chat, or
-- cut the friend off entirely.
begin;
\i scripts/rls/seed.sql

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000011101', 'kid-f2@kids.ourtrip.app'),
  ('00000000-0000-0000-0000-000000011102', 'k2b@probe.test');
insert into members (id, trip_id, auth_user_id, display_name, role) values
  ('00000000-0000-0000-0000-0000000111b7', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000011102', 'Kid2', 'kid');
insert into kid_devices (member_id, device_token_hash, pin_hash, approved_by) values
  ('00000000-0000-0000-0000-0000000111b7', 'k2b', 'x', '00000000-0000-0000-0000-0000000000b1');

create or replace function rls.as_kid2() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000011102","role":"authenticated"}', true) $$;
create or replace function rls.as_friend() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000011101","email":"kid-f2@kids.ourtrip.app","role":"authenticated"}', true) $$;
grant execute on all functions in schema rls to anon, authenticated;

insert into friend_links (id, trip_id, kid_member_id, friend_name, code_hash, expires_at, created_by) values
  ('00000000-0000-0000-0000-000000111001', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000b2', 'Noa', 'hash-111', now() + interval '1 hour', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-000000111009', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000b2', 'Waiting', 'hash-111w', now() + interval '1 hour', '00000000-0000-0000-0000-0000000000b1');
select rls.check('friend connected with Kid', public.friend_redeem('hash-111', '00000000-0000-0000-0000-0000000111f1',
  '00000000-0000-0000-0000-000000011101', 'kid-f2@kids.ourtrip.app', 't111', 'p') = 'Noa');

set local role authenticated;

-- nobody but a parent adds a kid
select rls.as_friend();
select rls.check('friend cannot add a kid', public.friend_add_kid(
  '00000000-0000-0000-0000-000000111001', '00000000-0000-0000-0000-0000000111b7') is null);
select rls.as_kid();
select rls.check('kid cannot add a kid', public.friend_add_kid(
  '00000000-0000-0000-0000-000000111001', '00000000-0000-0000-0000-0000000111b7') is null);
select rls.check('kid cannot close a chat', not public.friend_close_chat('00000000-0000-0000-0000-000000111001'));
select rls.as_guest();
select rls.check('guest cannot add a kid', public.friend_add_kid(
  '00000000-0000-0000-0000-000000111001', '00000000-0000-0000-0000-0000000111b7') is null);

-- the parent adds the second kid
select rls.as_owner();
select rls.check('not to a code that was not used', public.friend_add_kid(
  '00000000-0000-0000-0000-000000111009', '00000000-0000-0000-0000-0000000111b7') is null);
select rls.check('not with a guest as the kid', public.friend_add_kid(
  '00000000-0000-0000-0000-000000111001', '00000000-0000-0000-0000-0000000000b3') is null);
select rls.check('not a second open chat with the same kid', public.friend_add_kid(
  '00000000-0000-0000-0000-000000111001', '00000000-0000-0000-0000-0000000000b2') is null);
create temp table k2 on commit drop as
  select public.friend_add_kid('00000000-0000-0000-0000-000000111001', '00000000-0000-0000-0000-0000000111b7') as id;
grant select on k2 to authenticated;
select rls.check('second kid added', (select id is not null from k2));
select rls.check('not twice', public.friend_add_kid(
  '00000000-0000-0000-0000-000000111001', '00000000-0000-0000-0000-0000000111b7') is null);
select rls.check('parent sees both chats', (select count(*) = 2 from public.my_friend_channels()
  where friend_name = 'Noa'));

-- the friend: two chats, writes in each
select rls.as_friend();
select rls.check('friend is still a guest', public.current_member_role() = 'guest');
select rls.check('friend sees two chats, one per kid',
  (select count(*) = 2 and count(distinct kid_name) = 2 from public.my_friend_channels()));
insert into friend_messages (link_id, trip_id, sender_id, body) values
  ('00000000-0000-0000-0000-000000111001', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000111f1', 'to kid'),
  ((select id from k2), '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000111f1', 'to kid2');

-- each kid reads only their own chat with the friend
select rls.as_kid();
select rls.check('kid reads only own chat', (select count(*) = 1 and min(body) = 'to kid' from friend_messages)
  and (select count(*) = 1 from public.my_friend_channels()));
do $$ begin
  insert into friend_messages (link_id, trip_id, sender_id, body) values
    ((select id from k2), '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'in');
  raise exception 'FAIL  kid wrote in the other kid''s chat';
exception when insufficient_privilege then raise notice 'PASS  kid cannot write in the other kid''s chat';
end $$;
select rls.as_kid2();
select rls.check('kid2 reads only own chat', (select count(*) = 1 and min(body) = 'to kid2' from friend_messages)
  and (select count(*) = 1 and min(kid_name) = 'Kid2' from public.my_friend_channels()));
insert into friend_messages (link_id, trip_id, sender_id, body) values
  ((select id from k2), '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000111b7', 'hi back');

-- the parent closes the chat with kid2 only
select rls.as_owner();
select rls.check('parent reads all three messages', (select count(*) = 3 from friend_messages));
select rls.check('close one chat', public.friend_close_chat((select id from k2)));
select rls.check('parent still reads it', (select count(*) = 3 from friend_messages));

select rls.as_friend();
select rls.check('closed one: friend still connected, one chat left', public.current_member_id() is not null
  and (select count(*) = 1 and min(kid_name) = 'Kid' from public.my_friend_channels())
  and (select count(*) = 1 from friend_messages));
do $$ begin
  insert into friend_messages (link_id, trip_id, sender_id, body) values
    ((select id from k2), '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000111f1', 'still?');
  raise exception 'FAIL  friend wrote in a closed chat';
exception when insufficient_privilege then raise notice 'PASS  no writing in a closed chat';
end $$;
select rls.as_kid2();
select rls.check('closed one: gone for kid2', (select count(*) = 0 from friend_messages)
  and (select count(*) = 0 from public.my_friend_channels()));
select rls.as_kid();
select rls.check('closed one: kid keeps own chat', (select count(*) = 1 from public.my_friend_channels()));

-- added again: a new chat, the old one stays closed for the parents
select rls.as_owner();
select rls.check('kid2 added again', public.friend_add_kid(
  '00000000-0000-0000-0000-000000111001', '00000000-0000-0000-0000-0000000111b7') is not null);
select rls.as_kid2();
select rls.check('kid2: a fresh chat, old messages not in it', (select count(*) = 1 from public.my_friend_channels())
  and (select count(*) = 0 from friend_messages));

-- cutting off through one chat ends them all
select rls.as_owner();
select rls.check('cut the friend off', public.friend_revoke('00000000-0000-0000-0000-000000111001'));
select rls.check('every chat of the friend marked cut off',
  (select count(*) = 3 and bool_and(revoked) from public.my_friend_channels() where friend_name = 'Noa'));
select rls.check('the other code is untouched',
  (select revoked_at is null from friend_links where id = '00000000-0000-0000-0000-000000111009'));
select rls.as_friend();
select rls.check('cut off: not a member, no chat', public.current_member_id() is null
  and (select count(*) = 0 from friend_messages) and (select count(*) = 0 from public.my_friend_channels()));
select rls.as_kid2();
select rls.check('cut off: gone for kid2', (select count(*) = 0 from public.my_friend_channels()));

reset role;

-- closing the last open chat is cutting off
insert into friend_links (id, trip_id, kid_member_id, friend_name, code_hash, expires_at, created_by) values
  ('00000000-0000-0000-0000-000000111002', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000b2', 'Dan', 'hash-111b', now() + interval '1 hour', '00000000-0000-0000-0000-0000000000b1');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000011103', 'kid-f3@kids.ourtrip.app');
select public.friend_redeem('hash-111b', '00000000-0000-0000-0000-0000000111f2',
  '00000000-0000-0000-0000-000000011103', 'kid-f3@kids.ourtrip.app', 't111b', 'p');
set local role authenticated;
select rls.as_owner();
select rls.check('close the only chat', public.friend_close_chat('00000000-0000-0000-0000-000000111002'));
reset role;
select rls.check('last chat closed: device and guest entry revoked too',
  (select revoked_at is not null from kid_devices where member_id = '00000000-0000-0000-0000-0000000111f2')
  and (select revoked_at is not null from guests_allowlist where email = 'kid-f3@kids.ourtrip.app'));

do $$ begin
  insert into friend_links (trip_id, kid_member_id, friend_name, expires_at, created_by) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'x', now(), '00000000-0000-0000-0000-0000000000b1');
  raise exception 'FAIL  a link with neither code nor friend';
exception when check_violation then raise notice 'PASS  a link has a code or a friend';
end $$;

rollback;
