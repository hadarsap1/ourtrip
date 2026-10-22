-- 00066: a reply always goes to its message's audience.
-- guest is in Omer's class, guest2 in Ella's class.
begin;
\i scripts/rls/seed.sql

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000aa06', 'guest2@probe.test');
insert into members (id, trip_id, auth_user_id, email, display_name, role) values
  ('00000000-0000-0000-0000-0000000000b6', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000aa06', 'guest2@probe.test', 'Guest2', 'guest');
insert into guests_allowlist (trip_id, email, invited_by, labels) values
  ('00000000-0000-0000-0000-0000000000a1', 'guest2@probe.test', '00000000-0000-0000-0000-0000000000b1', array['כיתה אלה']);
update guests_allowlist set labels = array['כיתה עומר'] where email = 'guest@probe.test';

create or replace function rls.as_guest2() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000aa06","email":"guest2@probe.test","role":"authenticated"}', true) $$;
grant execute on all functions in schema rls to anon, authenticated;

set local role authenticated; select rls.as_owner();
insert into messages (id, trip_id, sender_id, body, channel, audience) values
  ('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'to omer class', 'guests', array['כיתה עומר']),
  ('00000000-0000-0000-0000-000000000a02', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'to everyone', 'guests', '{}');

-- a guest's reply takes the message's audience, whatever the client sends
select rls.as_guest();
insert into messages (id, trip_id, sender_id, body, channel, audience, reply_to) values
  ('00000000-0000-0000-0000-000000000a11', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', 'class reply', 'guests', '{}', '00000000-0000-0000-0000-000000000a01');
reset role;
select rls.check('guest reply sent as "everyone" lands in the message''s class',
  (select audience from messages where id = '00000000-0000-0000-0000-000000000a11') = array['כיתה עומר']);

set local role authenticated; select rls.as_guest2();
select rls.check('guest2: does not see the class reply',
  not exists (select 1 from messages where id = '00000000-0000-0000-0000-000000000a11'));

-- a guest cannot answer a message they cannot see
do $$ begin
  insert into messages (trip_id, sender_id, body, channel, reply_to) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b6', 'sneaky', 'guests', '00000000-0000-0000-0000-000000000a01');
  raise exception 'FAIL  guest2 answered a message of another class';
exception when insufficient_privilege then raise notice 'PASS  guest2: cannot answer another class''s message';
end $$;

-- a reply to a reply is attached to the top-level message
select rls.as_guest();
insert into messages (id, trip_id, sender_id, body, channel, reply_to) values
  ('00000000-0000-0000-0000-000000000a12', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', 'reply to reply', 'guests', '00000000-0000-0000-0000-000000000a11');
select rls.check('reply to a reply: one level deep, same audience',
  (select reply_to = '00000000-0000-0000-0000-000000000a01' and audience = array['כיתה עומר']
     from messages where id = '00000000-0000-0000-0000-000000000a12'));

-- everyone can answer an everyone message, and the answer goes to everyone
select rls.as_guest2();
insert into messages (id, trip_id, sender_id, body, channel, reply_to) values
  ('00000000-0000-0000-0000-000000000a13', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b6', 'public reply', 'guests', '00000000-0000-0000-0000-000000000a02');
select rls.as_guest();
select rls.check('guest: sees guest2''s reply to the everyone message',
  exists (select 1 from messages where id = '00000000-0000-0000-0000-000000000a13'));

-- a kid's reply waits for a parent, in the same audience
select rls.as_kid();
insert into messages (id, trip_id, sender_id, body, channel, reply_to) values
  ('00000000-0000-0000-0000-000000000a14', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'kid reply', 'guests', '00000000-0000-0000-0000-000000000a01');
reset role;
select rls.check('kid reply: pending, in the message''s class',
  (select approved_at is null and audience = array['כיתה עומר'] from messages where id = '00000000-0000-0000-0000-000000000a14'));
set local role authenticated; select rls.as_guest();
select rls.check('guest: kid''s reply hidden until approved',
  not exists (select 1 from messages where id = '00000000-0000-0000-0000-000000000a14'));

-- a waiting message cannot be answered, not even by a parent who sees it
select rls.as_kid();
insert into messages (id, trip_id, sender_id, body, channel) values
  ('00000000-0000-0000-0000-000000000a15', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'kid top-level', 'guests');
select rls.as_owner();
do $$ begin
  insert into messages (trip_id, sender_id, body, channel, reply_to) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'early', 'guests', '00000000-0000-0000-0000-000000000a15');
  raise exception 'FAIL  answered a message still waiting for approval';
exception when insufficient_privilege then raise notice 'PASS  a waiting message cannot be answered';
end $$;

-- a parent changing a message's audience takes its replies along
select rls.as_owner();
update messages set audience = array['כיתה אלה'] where id = '00000000-0000-0000-0000-000000000a01';
select rls.check('owner: replies follow the message to its new audience',
  not exists (select 1 from messages where reply_to = '00000000-0000-0000-0000-000000000a01' and audience <> array['כיתה אלה']));
select rls.as_guest2();
select rls.check('guest2: now sees the moved conversation',
  (select count(*) from messages where id in ('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a11', '00000000-0000-0000-0000-000000000a12')) = 3);
select rls.as_guest();
select rls.check('guest: no longer sees it, his own replies included',
  not exists (select 1 from messages where id in ('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a11', '00000000-0000-0000-0000-000000000a12')));

-- a parent cannot give one reply its own audience
select rls.as_owner();
update messages set audience = '{}' where id = '00000000-0000-0000-0000-000000000a11';
select rls.check('owner: a reply keeps its message''s audience',
  (select audience from messages where id = '00000000-0000-0000-0000-000000000a11') = array['כיתה אלה']);

-- deleting a message deletes its replies
delete from messages where id = '00000000-0000-0000-0000-000000000a01';
select rls.check('owner: deleting a message deletes its replies',
  not exists (select 1 from messages where reply_to = '00000000-0000-0000-0000-000000000a01'));
reset role;

rollback;
