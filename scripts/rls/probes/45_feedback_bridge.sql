-- 00045: reactions, comments, bridge columns.
begin;
\i scripts/rls/seed.sql

set local role authenticated; select rls.as_owner();
insert into posts (id, trip_id, author_id, title, status, visibility) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'family only', 'approved', 'family'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'for guests', 'approved', 'guests');
insert into messages (id, trip_id, sender_id, body, channel) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'family msg', 'family');
reset role;

-- guest: like + comment on the guests story; nothing on the family story
set local role authenticated; select rls.as_guest();
insert into reactions (trip_id, member_id, post_id, kind) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000d2', 'heart');
insert into comments (id, trip_id, author_id, post_id, body) values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000d2', 'כל הכבוד!');
select rls.check('guest: liked + commented a guests story',
  (select count(*) from reactions) = 1 and (select count(*) from comments) = 1);
do $$ begin
  insert into reactions (trip_id, member_id, post_id, kind) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000d1', 'heart');
  raise exception 'FAIL  guest liked a family-only story';
exception when insufficient_privilege then raise notice 'PASS  guest: cannot like a story they cannot see';
end $$;
do $$ begin
  insert into comments (trip_id, author_id, post_id, body) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000d1', 'x');
  raise exception 'FAIL  guest commented a family-only story';
exception when insufficient_privilege then raise notice 'PASS  guest: cannot comment a story they cannot see';
end $$;
do $$ begin
  insert into comments (trip_id, author_id, post_id, body) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d2', 'as owner');
  raise exception 'FAIL  guest commented as someone else';
exception when insufficient_privilege then raise notice 'PASS  guest: cannot comment in someone else''s name';
end $$;
do $$ begin
  insert into comments (trip_id, author_id, post_id, body, shown_to_kids_at) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000d2', 'x', now());
  raise exception 'FAIL  guest pre-stamped shown_to_kids';
exception when insufficient_privilege then raise notice 'PASS  guest: cannot mark own comment as shown to kids';
end $$;
-- guest tries to fake a bridged message in the guests feed
insert into messages (trip_id, sender_id, body, channel, origin_message_id, bridged_by, bridged_context) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', 'fake', 'guests',
   '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-0000000000b1', 'shared by a parent');
select rls.check('guest: bridge columns stripped from own message',
  (select origin_message_id is null and bridged_by is null and bridged_context is null from messages where body = 'fake'));
reset role;

-- kid: sees the like (with who), never the comment
set local role authenticated; select rls.as_kid();
select rls.check('kid: sees the guest''s like', (select count(*) from reactions) = 1);
select rls.check('kid: sees no comments at all', (select count(*) from comments) = 0);
insert into reactions (trip_id, member_id, post_id, kind) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000d1', 'star');
select rls.check('kid: can like a family story', (select count(*) from reactions where kind = 'star') = 1);
do $$ begin
  insert into comments (trip_id, author_id, post_id, body) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000d1', 'x');
  raise exception 'FAIL  kid wrote a comment';
exception when insufficient_privilege then raise notice 'PASS  kid: cannot write comments';
end $$;
delete from reactions where kind = 'heart';
select rls.check('kid: cannot remove someone else''s like', (select count(*) from reactions where kind = 'heart') = 1);
reset role;

-- guest: cannot see the kid's like on a family-only story
set local role authenticated; select rls.as_guest();
select rls.check('guest: likes on stories they cannot see stay hidden', (select count(*) from reactions where kind = 'star') = 0);
reset role;

-- owner bridges the guest comment to the kids
set local role authenticated; select rls.as_owner();
insert into messages (trip_id, sender_id, body, channel, origin_comment_id, bridged_by, bridged_context) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', 'כל הכבוד!', 'family',
   '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-0000000000b1', 'על הסיפור: for guests');
update comments set shown_to_kids_at = now(), shown_by = '00000000-0000-0000-0000-0000000000b1' where id = '00000000-0000-0000-0000-000000000201';
do $$ begin
  insert into messages (trip_id, sender_id, body, channel, origin_comment_id, bridged_by) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', 'again', 'family',
     '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-0000000000b1');
  raise exception 'FAIL  bridged the same comment twice';
exception when unique_violation then raise notice 'PASS  owner: a comment is bridged once';
end $$;
reset role;

set local role authenticated; select rls.as_kid();
-- 00049 retired the family feed for kids: they read the guests wall instead
select rls.check('kid: no longer reads the family feed', (select count(*) from messages where channel = 'family') = 0);
select rls.check('kid: still cannot read comments on a story', (select count(*) from comments) = 0);
select rls.check('kid: can resolve the guest''s name', exists (select 1 from members where id = '00000000-0000-0000-0000-0000000000b3'));
reset role;

set local role authenticated; select rls.as_revoked();
select rls.check('revoked guest: no reactions, no comments', (select count(*) from reactions) = 0 and (select count(*) from comments) = 0);
reset role;

rollback;
