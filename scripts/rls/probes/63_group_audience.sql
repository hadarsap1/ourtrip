-- 00063 + 00064: group audiences on the wall, stories and photos.
-- guest is in Omer's class (and friends), guest2 in Ella's class. The whole
-- family - parents and both kids - sees everything; only guests are limited.
begin;
\i scripts/rls/seed.sql

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000aa06', 'guest2@probe.test');
insert into members (id, trip_id, auth_user_id, email, display_name, role) values
  ('00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000000a1', null, null, 'Kid2', 'kid'),
  ('00000000-0000-0000-0000-0000000000b6', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000aa06', 'guest2@probe.test', 'Guest2', 'guest');
insert into kid_devices (member_id, device_token_hash, pin_hash, approved_by) values
  ('00000000-0000-0000-0000-0000000000b5', 'y', 'y', '00000000-0000-0000-0000-0000000000b1');
insert into guests_allowlist (trip_id, email, invited_by, labels) values
  ('00000000-0000-0000-0000-0000000000a1', 'guest2@probe.test', '00000000-0000-0000-0000-0000000000b1', array['כיתה אלה']);
update guests_allowlist set labels = array['כיתה עומר', 'חברים'] where email = 'guest@probe.test';
-- the revoked guest was in Omer's class: revocation still wins
update guests_allowlist set labels = array['כיתה עומר'] where email = 'gone@probe.test';

create or replace function rls.as_kid2() returns void language sql as $$
  select set_config('request.jwt.claims', '{"member_id":"00000000-0000-0000-0000-0000000000b5","role":"authenticated"}', true) $$;
create or replace function rls.as_guest2() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000aa06","email":"guest2@probe.test","role":"authenticated"}', true) $$;
grant execute on all functions in schema rls to anon, authenticated;

-- ============ the groups each member may address ============

set local role authenticated;
select rls.as_owner();
select rls.check('owner: every group on the list', public.my_groups() = array['חברים', 'כיתה אלה', 'כיתה עומר']);
select rls.as_kid();
select rls.check('kid: every group too (the family sees everything)', public.my_groups() = array['חברים', 'כיתה אלה', 'כיתה עומר']);
select rls.as_guest();
select rls.check('guest: only own groups', public.my_groups() = array['כיתה עומר', 'חברים']);
select rls.as_revoked();
select rls.check('revoked guest: no groups', public.my_groups() = '{}');
select rls.as_outsider();
select rls.check('outsider: no groups', coalesce(public.my_groups(), '{}') = '{}');
reset role;
set local role anon; select rls.as_anon();
select rls.check('anon: no groups', coalesce(public.my_groups(), '{}') = '{}');
reset role;

-- ============ the wall ============

set local role authenticated; select rls.as_owner();
insert into messages (id, trip_id, sender_id, body, channel, audience) values
  ('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'everyone', 'guests', '{}'),
  ('00000000-0000-0000-0000-000000000702', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'omer class', 'guests', array['כיתה עומר']),
  ('00000000-0000-0000-0000-000000000703', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'ella class', 'guests', array['כיתה אלה']),
  ('00000000-0000-0000-0000-000000000704', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'both classes', 'guests', array['כיתה עומר', 'כיתה אלה']),
  ('00000000-0000-0000-0000-000000000705', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'friends', 'guests', array['חברים']);
select rls.check('owner: sees every audience', (select count(*) from messages) = 5);

select rls.as_guest();
select rls.check('guest (Omer''s class, friends): everyone + own groups only',
  (select array_agg(body order by body) from messages) = array['both classes', 'everyone', 'friends', 'omer class']);
select rls.as_guest2();
select rls.check('guest2 (Ella''s class): everyone + own group only',
  (select array_agg(body order by body) from messages) = array['both classes', 'ella class', 'everyone']);
select rls.as_kid();
select rls.check('kid: sees every audience', (select count(*) from messages) = 5);
select rls.as_kid2();
select rls.check('kid2: sees every audience', (select count(*) from messages) = 5);
select rls.as_revoked();
select rls.check('revoked guest: nothing, groups or not', (select count(*) from messages) = 0);
select rls.as_outsider();
select rls.check('outsider: nothing', (select count(*) from messages) = 0);
reset role;
set local role anon; select rls.as_anon();
select rls.check('anon: nothing', (select count(*) from messages) = 0);
reset role;

-- guests write only to everyone or their own groups: a class's replies stay in it
set local role authenticated; select rls.as_guest();
insert into messages (trip_id, sender_id, body, channel, audience) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', 'reply in omer class', 'guests', array['כיתה עומר']);
insert into messages (trip_id, sender_id, body, channel, audience) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', 'to both my groups', 'guests', array['כיתה עומר', 'חברים']);
do $$ begin
  insert into messages (trip_id, sender_id, body, channel, audience) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', 'into ella class', 'guests', array['כיתה אלה']);
  raise exception 'FAIL  guest wrote into a group they are not in';
exception when insufficient_privilege then raise notice 'PASS  guest: cannot write into another group';
end $$;
do $$ begin
  insert into messages (trip_id, sender_id, body, channel, audience) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', 'mine + ella', 'guests', array['כיתה עומר', 'כיתה אלה']);
  raise exception 'FAIL  guest widened a message into a group they are not in';
exception when insufficient_privilege then raise notice 'PASS  guest: cannot add a group they are not in';
end $$;
select rls.as_guest2();
select rls.check('guest2: does not see the replies in Omer''s class',
  not exists (select 1 from messages where body in ('reply in omer class', 'to both my groups')));
select rls.as_kid2();
select rls.check('kid2 (Ella): sees Omer''s class''s reply - the family sees all',
  exists (select 1 from messages where body = 'reply in omer class'));

-- a kid chooses any groups; it waits for a parent
select rls.as_kid();
insert into messages (id, trip_id, sender_id, body, channel, audience) values
  ('00000000-0000-0000-0000-000000000706', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'omer to two classes', 'guests', array['כיתה עומר', 'כיתה אלה']);
select rls.check('kid: own pending message visible to him',
  exists (select 1 from messages where id = '00000000-0000-0000-0000-000000000706' and approved_at is null));
select rls.as_guest();
select rls.check('guest: kid''s pending message hidden until approved',
  not exists (select 1 from messages where id = '00000000-0000-0000-0000-000000000706'));

-- a kid cannot change the audience afterwards
select rls.as_kid();
update messages set audience = '{}' where id = '00000000-0000-0000-0000-000000000706';
reset role;
select rls.check('kid: audience unchanged after an update attempt',
  (select audience from messages where id = '00000000-0000-0000-0000-000000000706') = array['כיתה עומר', 'כיתה אלה']);

-- the parent approves and changes the audience in the same step
set local role authenticated; select rls.as_owner();
update messages set approved_at = now(), audience = array['כיתה עומר']
 where id = '00000000-0000-0000-0000-000000000706';
select rls.as_guest();
select rls.check('guest: sees the approved class message',
  exists (select 1 from messages where id = '00000000-0000-0000-0000-000000000706'));
select rls.as_guest2();
select rls.check('guest2: the parent took Ella''s class off - not visible',
  not exists (select 1 from messages where id = '00000000-0000-0000-0000-000000000706'));
reset role;

-- ============ stories ============

set local role authenticated; select rls.as_owner();
insert into posts (id, trip_id, author_id, title, status, visibility, audience) values
  ('00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'for every guest', 'approved', 'guests', '{}'),
  ('00000000-0000-0000-0000-000000000802', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'for omer class', 'approved', 'guests', array['כיתה עומר']);
do $$ begin
  insert into posts (trip_id, author_id, title, status, visibility, audience) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'public to a group', 'approved', 'public', array['כיתה עומר']);
  raise exception 'FAIL  public story with a group audience';
exception when check_violation then raise notice 'PASS  a public story cannot have a group audience';
end $$;

select rls.as_guest();
select rls.check('guest (Omer''s class): sees both stories',
  (select count(*) from posts where id in ('00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000802')) = 2);
select rls.as_guest2();
select rls.check('guest2: sees only the story for every guest',
  (select array_agg(title) from posts) = array['for every guest']);
select rls.as_kid2();
select rls.check('kid2: sees Omer''s class''s story - the family sees all',
  exists (select 1 from posts where id = '00000000-0000-0000-0000-000000000802'));

-- comments and reactions follow the story
select rls.as_guest();
insert into comments (trip_id, author_id, post_id, body) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-000000000802', 'class comment');
select rls.as_guest2();
select rls.check('guest2: does not see a comment on Omer''s class''s story',
  not exists (select 1 from comments where body = 'class comment'));
do $$ begin
  insert into comments (trip_id, author_id, post_id, body) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b6', '00000000-0000-0000-0000-000000000802', 'sneaky');
  raise exception 'FAIL  guest2 commented on a story outside their group';
exception when insufficient_privilege then raise notice 'PASS  guest2: cannot comment on another group''s story';
end $$;
do $$ begin
  insert into reactions (trip_id, member_id, post_id, kind) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b6', '00000000-0000-0000-0000-000000000802', 'heart');
  raise exception 'FAIL  guest2 reacted to a story outside their group';
exception when insufficient_privilege then raise notice 'PASS  guest2: cannot react to another group''s story';
end $$;

-- a kid's story carries the kid's choice, but stays family until a parent publishes
select rls.as_kid();
insert into posts (id, trip_id, author_id, title, status, visibility, audience) values
  ('00000000-0000-0000-0000-000000000803', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'kid story', 'approved', 'guests', array['כיתה עומר']);
select rls.check('kid insert: pending, family, the kid''s groups kept as a suggestion',
  (select status = 'pending' and visibility = 'family' and audience = array['כיתה עומר']
     from posts where id = '00000000-0000-0000-0000-000000000803'));
select rls.as_guest();
select rls.check('guest: the kid''s story is not out before a parent publishes it',
  not exists (select 1 from posts where id = '00000000-0000-0000-0000-000000000803'));
select rls.as_owner();
update posts set status = 'approved', visibility = 'guests' where id = '00000000-0000-0000-0000-000000000803';
select rls.as_guest();
select rls.check('guest: sees the kid''s story once published to his class',
  exists (select 1 from posts where id = '00000000-0000-0000-0000-000000000803'));
select rls.as_guest2();
select rls.check('guest2: not in that class - does not see it',
  not exists (select 1 from posts where id = '00000000-0000-0000-0000-000000000803'));
select rls.as_kid();
update posts set audience = '{}' where id = '00000000-0000-0000-0000-000000000803';
reset role;
select rls.check('kid: cannot widen a published story',
  (select audience from posts where id = '00000000-0000-0000-0000-000000000803') = array['כיתה עומר']);

-- ============ photos ============

insert into photos (id, trip_id, uploaded_by, file_path, status, shared_with_guests, audience) values
  ('00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'p/class.jpg', 'approved', true, array['כיתה עומר']),
  ('00000000-0000-0000-0000-000000000902', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'p/class-unshared.jpg', 'approved', false, array['כיתה עומר']),
  ('00000000-0000-0000-0000-000000000903', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'p/class-pending.jpg', 'pending', true, array['כיתה עומר']);
insert into post_photos (post_id, photo_id, position) values
  ('00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000901', 0);

set local role authenticated; select rls.as_guest();
select rls.check('guest (Omer''s class): sees the shared class photo',
  exists (select 1 from photos where id = '00000000-0000-0000-0000-000000000901'));
select rls.check('guest: #5 still holds inside the group (unshared, pending hidden)',
  not exists (select 1 from photos where id in ('00000000-0000-0000-0000-000000000902', '00000000-0000-0000-0000-000000000903')));
select rls.as_guest2();
select rls.check('guest2: does not see the class photo',
  not exists (select 1 from photos where id = '00000000-0000-0000-0000-000000000901'));
select rls.check('guest2: a class photo in an every-guest story does not leak through post_photos',
  not exists (select 1 from post_photos where photo_id = '00000000-0000-0000-0000-000000000901'));
select rls.check('guest2: still sees the photo shared with everyone',
  exists (select 1 from photos where id = '00000000-0000-0000-0000-0000000000c1'));
select rls.as_kid2();
select rls.check('kid2: family photos stay visible to every kid',
  exists (select 1 from photos where id = '00000000-0000-0000-0000-000000000901'));

-- a kid's upload keeps the kid's groups but stays pending and unshared (#5)
select rls.as_kid();
insert into photos (id, trip_id, uploaded_by, file_path, status, shared_with_guests, audience) values
  ('00000000-0000-0000-0000-000000000904', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'p/kid.jpg', 'approved', true, array['כיתה עומר']);
update photos set audience = '{}', shared_with_guests = true where id = '00000000-0000-0000-0000-000000000904';
reset role;
select rls.check('kid photo: pending, unshared, the kid''s groups kept and not changeable after',
  (select audience = array['כיתה עומר'] and status = 'pending' and not shared_with_guests
     from photos where id = '00000000-0000-0000-0000-000000000904'));

-- ============ the shape ============

set local role authenticated; select rls.as_owner();
do $$ begin
  update messages set audience = array[''] where id = '00000000-0000-0000-0000-000000000701';
  raise exception 'FAIL  empty group name accepted';
exception when check_violation then raise notice 'PASS  message audience: empty group name rejected';
end $$;
reset role;

rollback;
