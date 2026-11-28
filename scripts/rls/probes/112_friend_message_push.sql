-- 00112: a friend chat message is told by push to the other side, and the
-- parents hear once per wave when a message to a KID waits unread. Only the
-- service role claims pushes; only parents read or change the minutes.
begin;
\i scripts/rls/seed.sql

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000011201', 'kid-f3@kids.ourtrip.app');
create or replace function rls.as_friend() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000011201","email":"kid-f3@kids.ourtrip.app","role":"authenticated"}', true) $$;
grant execute on all functions in schema rls to anon, authenticated;

insert into friend_links (id, trip_id, kid_member_id, friend_name, code_hash, expires_at, created_by) values
  ('00000000-0000-0000-0000-000000112001', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000b2', 'Noa', 'hash-112', now() + interval '1 hour', '00000000-0000-0000-0000-0000000000b1');
select rls.check('friend connected', public.friend_redeem('hash-112', '00000000-0000-0000-0000-0000000112f1',
  '00000000-0000-0000-0000-000000011201', 'kid-f3@kids.ourtrip.app', 't112', 'p') = 'Noa');

-- results of a claim, kept for the checks (the claim marks them told)
create temp table got (kind text, link_id uuid, member_id uuid, from_name text, kid_name text, n integer, since timestamptz);
grant all on got to authenticated, service_role;
create or replace function rls.claim() returns void language sql as $$
  delete from got;
  insert into got select * from public.claim_friend_pushes('00000000-0000-0000-0000-0000000000a1');
$$;
grant usage on schema rls to service_role;
grant execute on function rls.claim(), rls.check(text, boolean) to service_role;

-- ============ who may claim, read the state, or set the minutes ============

set local role authenticated;
do $$
declare who text;
begin
  foreach who in array array['owner', 'kid', 'guest', 'friend'] loop
    execute format('select rls.as_%s()', who);
    begin
      perform public.claim_friend_pushes('00000000-0000-0000-0000-0000000000a1');
      raise notice 'FAIL  % could claim pushes', who;
    exception when insufficient_privilege then
      raise notice 'PASS  % cannot claim pushes', who;
    end;
    begin
      perform 1 from friend_push_state;
      raise notice 'FAIL  % could read the push state', who;
    exception when insufficient_privilege then
      raise notice 'PASS  % cannot read the push state', who;
    end;
  end loop;
end $$;

-- the minutes: parents only
do $$
declare who text;
begin
  foreach who in array array['kid', 'guest', 'friend'] loop
    execute format('select rls.as_%s()', who);
    begin
      insert into friend_push_settings (trip_id, parent_alert_minutes)
      values ('00000000-0000-0000-0000-0000000000a1', 5);
      raise notice 'FAIL  % could set the minutes', who;
    exception when insufficient_privilege then
      raise notice 'PASS  % cannot set the minutes', who;
    end;
  end loop;
end $$;

select rls.as_owner();
insert into friend_push_settings (trip_id, parent_alert_minutes) values ('00000000-0000-0000-0000-0000000000a1', 15);
select rls.check('parent reads the minutes', (select parent_alert_minutes = 15 from friend_push_settings));
do $$ begin
  update friend_push_settings set parent_alert_minutes = 2;
  raise notice 'FAIL  less than 5 minutes was accepted';
exception when check_violation then raise notice 'PASS  at least 5 minutes';
end $$;

select rls.as_kid();
select rls.check('kid sees no setting', (select count(*) = 0 from friend_push_settings));
update friend_push_settings set parent_alert_minutes = 200;
select rls.as_friend();
select rls.check('friend sees no setting', (select count(*) = 0 from friend_push_settings));
update friend_push_settings set parent_alert_minutes = 200;
select rls.as_guest();
select rls.check('guest sees no setting', (select count(*) = 0 from friend_push_settings));
update friend_push_settings set parent_alert_minutes = 200;
select rls.as_owner();
select rls.check('their updates changed nothing', (select parent_alert_minutes = 15 from friend_push_settings));
reset role;

-- ============ the pushes ============

-- two messages from the friend to the kid, the first 20 minutes ago
insert into friend_messages (link_id, trip_id, sender_id, body, created_at) values
  ('00000000-0000-0000-0000-000000112001', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000112f1', 'hi', now() - interval '20 minutes'),
  ('00000000-0000-0000-0000-000000112001', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000112f1', 'there?', now() - interval '2 minutes');

set local role service_role;
select rls.claim();
select rls.check('kid told of 2 messages, from the friend by name', (select count(*) = 1 from got
  where kind = 'message' and member_id = '00000000-0000-0000-0000-0000000000b2' and n = 2 and from_name = 'Noa'));
select rls.check('parents told once: 2 waiting for the kid', (select count(*) = 1 from got
  where kind = 'parents' and member_id = '00000000-0000-0000-0000-0000000000b2' and n = 2 and kid_name = 'Kid'));
select rls.check('the friend is told nothing', (select count(*) = 0 from got
  where member_id = '00000000-0000-0000-0000-0000000112f1'));
select rls.check('no push carries the words', (select count(*) = 0 from got where from_name in ('hi', 'there?')));

select rls.claim();
select rls.check('a second claim sends nothing again', (select count(*) = 0 from got));
reset role;

-- one more from the friend while the kid has still not opened the chat
insert into friend_messages (link_id, trip_id, sender_id, body, created_at) values
  ('00000000-0000-0000-0000-000000112001', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000112f1', 'hello??', now() - interval '1 minute');
set local role service_role;
select rls.claim();
select rls.check('kid told of the new one only', (select count(*) = 1 from got where kind = 'message' and n = 1));
select rls.check('same wave: the parents are not told again', (select count(*) = 0 from got where kind = 'parents'));
reset role;

-- the kid writes; 30 minutes go by and the friend has not read it
insert into friend_messages (link_id, trip_id, sender_id, body, created_at) values
  ('00000000-0000-0000-0000-000000112001', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'yes!', now() - interval '30 minutes');
set local role service_role;
select rls.claim();
select rls.check('friend told of the kid''s message, by the kid''s name', (select count(*) = 1 from got
  where kind = 'message' and member_id = '00000000-0000-0000-0000-0000000112f1' and from_name = 'Kid'));
select rls.check('never the parents about the friend', (select count(*) = 0 from got where kind = 'parents'));
reset role;

-- a new wave: the kid opened the chat after the last parents' push, then a
-- message came 40 minutes ago and waits
update friend_push_state set parents_notified_at = now() - interval '2 hours', notified_at = now() - interval '2 hours'
 where member_id = '00000000-0000-0000-0000-0000000000b2';
delete from friend_messages where sender_id = '00000000-0000-0000-0000-0000000112f1';
insert into friend_reads (link_id, member_id, read_at) values
  ('00000000-0000-0000-0000-000000112001', '00000000-0000-0000-0000-0000000000b2', now() - interval '50 minutes');
insert into friend_messages (link_id, trip_id, sender_id, body, created_at) values
  ('00000000-0000-0000-0000-000000112001', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000112f1', 'wave 2', now() - interval '40 minutes');

-- the parents chose 60 minutes: not yet
update friend_push_settings set parent_alert_minutes = 60;
set local role service_role;
select rls.claim();
select rls.check('kid told of the new wave', (select count(*) = 1 from got where kind = 'message'
  and member_id = '00000000-0000-0000-0000-0000000000b2'));
select rls.check('60 minutes: 40 is not yet', (select count(*) = 0 from got where kind = 'parents'));
reset role;

update friend_push_settings set parent_alert_minutes = 30;
set local role service_role;
select rls.claim();
select rls.check('30 minutes: the parents are told of the new wave', (select count(*) = 1 from got
  where kind = 'parents' and n = 1));
reset role;

-- a read before the last parents' push does not open a new wave
update friend_push_state set parents_notified_at = now() - interval '10 minutes'
 where member_id = '00000000-0000-0000-0000-0000000000b2';
set local role service_role;
select rls.claim();
select rls.check('not read since the last push: nothing', (select count(*) = 0 from got));
reset role;

-- a chat that was cut off tells nobody anything
update friend_push_state set parents_notified_at = null, notified_at = null;
update friend_links set revoked_at = now() where id = '00000000-0000-0000-0000-000000112001';
set local role service_role;
select rls.claim();
select rls.check('a cut-off chat: no pushes', (select count(*) = 0 from got));
reset role;

rollback;
