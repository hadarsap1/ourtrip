-- 00110: a friend is a guest with a private chat with one kid. The code is
-- spent once; the two sides write, parents read; nobody else sees anything;
-- cutting off stops everything.
begin;
\i scripts/rls/seed.sql

-- a second kid, to show one kid never reads the other's chat
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000011001', 'kid-f1@kids.ourtrip.app'),
  ('00000000-0000-0000-0000-000000011002', 'k2@probe.test');
insert into members (id, trip_id, auth_user_id, display_name, role) values
  ('00000000-0000-0000-0000-0000000110b7', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000011002', 'Kid2', 'kid');
insert into kid_devices (member_id, device_token_hash, pin_hash, approved_by) values
  ('00000000-0000-0000-0000-0000000110b7', 'k2', 'x', '00000000-0000-0000-0000-0000000000b1');

create or replace function rls.as_kid2() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000011002","role":"authenticated"}', true) $$;
create or replace function rls.as_friend() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000011001","email":"kid-f1@kids.ourtrip.app","role":"authenticated"}', true) $$;
grant execute on all functions in schema rls to anon, authenticated;

insert into friend_links (id, trip_id, kid_member_id, friend_name, code_hash, expires_at, created_by) values
  ('00000000-0000-0000-0000-000000110001', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000b2', 'Noa', 'hash-ok', now() + interval '1 hour', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-000000110002', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000b2', 'Late', 'hash-old', now() - interval '1 minute', '00000000-0000-0000-0000-0000000000b1');

set local role authenticated;
select rls.as_owner();
do $$ begin
  perform public.friend_redeem('hash-ok', gen_random_uuid(), '00000000-0000-0000-0000-000000011001', 'x@x', 't', 'p');
  raise exception 'FAIL  a signed-in user could redeem';
exception when insufficient_privilege then raise notice 'PASS  redeem is the service role''s only';
end $$;
reset role;

select rls.check('expired code: nothing', public.friend_redeem('hash-old', gen_random_uuid(),
  '00000000-0000-0000-0000-000000011001', 'a@kids.ourtrip.app', 't0', 'p') is null);
select rls.check('good code: connected', public.friend_redeem('hash-ok', '00000000-0000-0000-0000-0000000110f1',
  '00000000-0000-0000-0000-000000011001', 'kid-f1@kids.ourtrip.app', 't1', 'p') = 'Noa');
select rls.check('the same code twice: nothing', public.friend_redeem('hash-ok', gen_random_uuid(),
  '00000000-0000-0000-0000-000000011001', 'b@kids.ourtrip.app', 't2', 'p') is null);

-- the friend: a guest, with the one chat
set local role authenticated;
select rls.as_friend();
select rls.check('friend is a guest', public.current_member_role() = 'guest' and public.active_guest_trip() is not null);
insert into friend_messages (link_id, trip_id, sender_id, body) values
  ('00000000-0000-0000-0000-000000110001', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000110f1', 'hi');
select rls.check('friend sees own channel with the kid''s name',
  (select count(*) = 1 and min(kid_name) = 'Kid' from public.my_friend_channels()));
select rls.check('friend reads no links table', (select count(*) = 0 from friend_links));
select rls.check('friend sees shared photos only', (select count(*) = 1 from photos));
do $$ begin
  insert into friend_messages (link_id, trip_id, sender_id, body) values
    ('00000000-0000-0000-0000-000000110001', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'as the kid');
  raise exception 'FAIL  friend wrote in the kid''s name';
exception when insufficient_privilege then raise notice 'PASS  no writing in another''s name';
end $$;
do $$ begin
  perform code_hash from friend_links;
  raise exception 'FAIL  code hash readable';
exception when insufficient_privilege then raise notice 'PASS  code hash is never readable';
end $$;
do $$ begin
  update friend_messages set body = 'changed';
  raise exception 'FAIL  a message was edited';
exception when insufficient_privilege then raise notice 'PASS  messages are never edited';
end $$;
select rls.check('friend cannot cut anyone off', not public.friend_revoke('00000000-0000-0000-0000-000000110001'));
delete from friend_messages;
select rls.check('friend deletes nothing', (select count(*) = 1 from friend_messages));

-- the kid: reads, answers, no approval anywhere
select rls.as_kid();
select rls.check('kid reads the chat, 1 unread',
  (select count(*) = 1 from friend_messages) and (select unread = 1 from public.my_friend_channels()));
select public.mark_friend_read('00000000-0000-0000-0000-000000110001');
select rls.check('opened: 0 unread', (select unread = 0 from public.my_friend_channels()));
insert into friend_messages (link_id, trip_id, sender_id, body) values
  ('00000000-0000-0000-0000-000000110001', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'hello');

-- the other kid, an ordinary guest, a stranger, anon: nothing
select rls.as_kid2();
select rls.check('other kid: no chat', (select count(*) = 0 from friend_messages)
  and (select count(*) = 0 from public.my_friend_channels()));
do $$ begin
  insert into friend_messages (link_id, trip_id, sender_id, body) values
    ('00000000-0000-0000-0000-000000110001', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000110b7', 'in');
  raise exception 'FAIL  other kid wrote';
exception when insufficient_privilege then raise notice 'PASS  other kid cannot write';
end $$;
select rls.as_guest();
select rls.check('ordinary guest: nothing', (select count(*) = 0 from friend_messages)
  and (select count(*) = 0 from public.my_friend_channels()) and (select count(*) = 0 from friend_links));
select rls.as_outsider();
select rls.check('stranger: nothing', (select count(*) = 0 from friend_messages)
  and (select count(*) = 0 from public.my_friend_channels()));

-- parents: read, never write
select rls.as_owner();
select rls.check('parent reads the chat', (select count(*) = 2 from friend_messages));
do $$ begin
  insert into friend_messages (link_id, trip_id, sender_id, body) values
    ('00000000-0000-0000-0000-000000110001', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'parent');
  raise exception 'FAIL  parent wrote into the chat';
exception when insufficient_privilege then raise notice 'PASS  parents do not write in it';
end $$;
select rls.check('parent cuts the friend off', public.friend_revoke('00000000-0000-0000-0000-000000110001'));
select rls.check('parent still reads it', (select count(*) = 2 from friend_messages));
select rls.check('parent still has it in the list, marked cut off',
  (select count(*) = 1 and bool_and(revoked) from public.my_friend_channels()));

select rls.as_friend();
select rls.check('cut off: not a member, no photos, no chat', public.current_member_id() is null
  and (select count(*) = 0 from photos) and (select count(*) = 0 from friend_messages));
select rls.as_kid();
select rls.check('cut off: gone for the kid', (select count(*) = 0 from friend_messages)
  and (select count(*) = 0 from public.my_friend_channels()));

reset role;
rollback;
