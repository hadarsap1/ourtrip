-- 00063: group audiences on the wall, stories and photos.
-- Two classes: guest (Omer's class) and guest2 (Ella's class); kid = Omer,
-- kid2 = Ella. Each class is linked to its kid.
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

-- ============ linking a group to a kid ============

set local role authenticated;
select rls.as_owner();
insert into guest_group_kids (trip_id, label, member_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'כיתה עומר', '00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000a1', 'כיתה אלה', '00000000-0000-0000-0000-0000000000b5');
select rls.check('owner: links each class to its kid', (select count(*) from guest_group_kids) = 2);
do $$ begin
  insert into guest_group_kids (trip_id, label, member_id) values
    ('00000000-0000-0000-0000-0000000000a1', 'חברים', '00000000-0000-0000-0000-0000000000b3');
  raise exception 'FAIL  a group was linked to a guest';
exception when check_violation then raise notice 'PASS  owner: cannot link a group to a guest';
end $$;

select rls.as_kid();
select rls.check('kid: sees only the group linked to them',
  (select array_agg(label) from guest_group_kids) = array['כיתה עומר']);
do $$ begin
  insert into guest_group_kids (trip_id, label, member_id) values
    ('00000000-0000-0000-0000-0000000000a1', 'חברים', '00000000-0000-0000-0000-0000000000b2');
  raise exception 'FAIL  kid linked a group to themself';
exception when insufficient_privilege then raise notice 'PASS  kid: cannot link a group';
end $$;
select rls.as_guest();
select rls.check('guest: sees no group links', (select count(*) from guest_group_kids) = 0);
reset role;

-- ============ the wall ============

-- written by a parent (approved at insert)
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
select rls.check('kid (Omer): everyone + Omer''s class, not Ella''s, not unlinked friends',
  (select array_agg(body order by body) from messages) = array['both classes', 'everyone', 'omer class']);
select rls.as_kid2();
select rls.check('kid2 (Ella): everyone + Ella''s class, not Omer''s',
  (select array_agg(body order by body) from messages) = array['both classes', 'ella class', 'everyone']);
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
do $$ begin
  insert into messages (trip_id, sender_id, body, channel, audience) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', 'into ella class', 'guests', array['כיתה אלה']);
  raise exception 'FAIL  guest wrote into a group they are not in';
exception when insufficient_privilege then raise notice 'PASS  guest: cannot write into another group';
end $$;
select rls.as_guest2();
select rls.check('guest2: does not see the reply in Omer''s class',
  not exists (select 1 from messages where body = 'reply in omer class'));
select rls.as_kid();
select rls.check('kid (Omer): sees his class''s reply',
  exists (select 1 from messages where body = 'reply in omer class'));
select rls.as_kid2();
select rls.check('kid2 (Ella): does not see Omer''s class''s reply',
  not exists (select 1 from messages where body = 'reply in omer class'));

-- a kid writes to everyone or their own group; it waits for a parent
select rls.as_kid();
insert into messages (id, trip_id, sender_id, body, channel, audience) values
  ('00000000-0000-0000-0000-000000000706', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'omer to his class', 'guests', array['כיתה עומר']);
do $$ begin
  insert into messages (trip_id, sender_id, body, channel, audience) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'omer to ella class', 'guests', array['כיתה אלה']);
  raise exception 'FAIL  kid wrote into a group not linked to them';
exception when insufficient_privilege then raise notice 'PASS  kid: cannot write into another kid''s group';
end $$;
do $$ begin
  insert into messages (trip_id, sender_id, body, channel, audience) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'omer to friends', 'guests', array['חברים']);
  raise exception 'FAIL  kid wrote into an unlinked group';
exception when insufficient_privilege then raise notice 'PASS  kid: cannot write into an unlinked group';
end $$;
select rls.check('kid: own pending message visible to him',
  exists (select 1 from messages where id = '00000000-0000-0000-0000-000000000706' and approved_at is null));
select rls.as_guest();
select rls.check('guest: kid''s pending class message hidden until approved',
  not exists (select 1 from messages where id = '00000000-0000-0000-0000-000000000706'));
select rls.as_kid2();
select rls.check('kid2: never sees Omer''s pending class message',
  not exists (select 1 from messages where id = '00000000-0000-0000-0000-000000000706'));

-- a kid cannot widen the audience afterwards
select rls.as_kid();
update messages set audience = '{}' where id = '00000000-0000-0000-0000-000000000706';
reset role;
select rls.check('kid: audience unchanged after an update attempt',
  (select audience from messages where id = '00000000-0000-0000-0000-000000000706') = array['כיתה עומר']);

-- the parent approves and narrows/changes the audience in the same step
set local role authenticated; select rls.as_owner();
update messages set approved_at = now(), audience = array['כיתה עומר', 'חברים']
 where id = '00000000-0000-0000-0000-000000000706';
select rls.as_guest();
select rls.check('guest: sees the approved class message',
  exists (select 1 from messages where id = '00000000-0000-0000-0000-000000000706'));
select rls.as_guest2();
select rls.check('guest2: still does not see it',
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
select rls.as_kid();
select rls.check('kid (Omer): sees his class''s story',
  exists (select 1 from posts where id = '00000000-0000-0000-0000-000000000802'));
select rls.as_kid2();
select rls.check('kid2 (Ella): does not see Omer''s class''s story',
  not exists (select 1 from posts where id = '00000000-0000-0000-0000-000000000802'));

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

-- a kid never sets a story's audience
select rls.as_kid();
insert into posts (id, trip_id, author_id, title, status, visibility, audience) values
  ('00000000-0000-0000-0000-000000000803', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'kid story', 'pending', 'guests', array['כיתה עומר']);
select rls.check('kid insert: audience forced to everyone, visibility to family',
  (select audience = '{}' and visibility = 'family' from posts where id = '00000000-0000-0000-0000-000000000803'));
update posts set audience = array['כיתה עומר'] where id = '00000000-0000-0000-0000-000000000803';
select rls.check('kid update: audience unchanged',
  (select audience = '{}' from posts where id = '00000000-0000-0000-0000-000000000803'));
reset role;

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

-- a kid's upload gets no audience, and a kid cannot set one later
select rls.as_kid();
insert into photos (id, trip_id, uploaded_by, file_path, audience) values
  ('00000000-0000-0000-0000-000000000904', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'p/kid.jpg', array['כיתה עומר']);
update photos set audience = array['כיתה אלה'] where id = '00000000-0000-0000-0000-000000000904';
reset role;
select rls.check('kid: photo audience forced to everyone and not changeable',
  (select audience = '{}' and status = 'pending' and not shared_with_guests from photos where id = '00000000-0000-0000-0000-000000000904'));

-- ============ the shape ============

set local role authenticated; select rls.as_owner();
do $$ begin
  update messages set audience = array[''] where id = '00000000-0000-0000-0000-000000000701';
  raise exception 'FAIL  empty group name accepted';
exception when check_violation then raise notice 'PASS  message audience: empty group name rejected';
end $$;
reset role;

rollback;
