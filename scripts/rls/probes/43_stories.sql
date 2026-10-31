-- 00043: guest labels + stories (posts, post_photos).
begin;
\i scripts/rls/seed.sql

-- owner writes: family story, guests story with a shared + an unshared photo,
-- a scheduled guests story, a draft
set local role authenticated; select rls.as_owner();
insert into posts (id, trip_id, author_id, title, status, visibility) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'family only', 'approved', 'family'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'for guests', 'approved', 'guests'),
  ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'owner draft', 'draft', 'guests');
insert into posts (id, trip_id, author_id, title, status, visibility, publish_after) values
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'later', 'approved', 'guests', now() + interval '2 days');
insert into post_photos (post_id, photo_id, position) values
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c1', 0),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c2', 1);
select rls.check('owner: approved story gets published_at + approved_by',
  (select published_at is not null and approved_by = '00000000-0000-0000-0000-0000000000b1' from posts where id = '00000000-0000-0000-0000-0000000000d2'));
select rls.check('owner: draft has no published_at',
  (select published_at is null from posts where id = '00000000-0000-0000-0000-0000000000d4'));
select rls.check('owner: sees all 4 stories', (select count(*) from posts) = 4);
reset role;

-- kid: tries to self-approve and address guests on insert
set local role authenticated; select rls.as_kid();
insert into posts (id, trip_id, author_id, title, status, visibility, approved_by) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'kid story', 'approved', 'guests', '00000000-0000-0000-0000-0000000000b2');
select rls.check('kid insert: forced to pending / family / unapproved',
  (select status = 'pending' and visibility = 'family' and approved_by is null and published_at is null
     from posts where id = '00000000-0000-0000-0000-0000000000e1'));
-- tries again on update. 00078: a family entry is the kid's to save, so
-- 'approved' now holds - but only for the family, with no approver
update posts set status = 'approved', visibility = 'public' where id = '00000000-0000-0000-0000-0000000000e1';
select rls.check('kid update: cannot change audience or stamp an approver',
  (select visibility = 'family' and approved_by is null from posts where id = '00000000-0000-0000-0000-0000000000e1'));
update posts set status = 'draft', title = 'kid story v2' where id = '00000000-0000-0000-0000-0000000000e1';
select rls.check('kid update: can move own story back to draft and edit it',
  (select status = 'draft' and title = 'kid story v2' from posts where id = '00000000-0000-0000-0000-0000000000e1'));
-- reads: published stories of every audience + own; never an owner draft
select rls.check('kid: sees 3 published + own (not the owner draft)',
  (select count(*) from posts) = 4
  and not exists (select 1 from posts where id = '00000000-0000-0000-0000-0000000000d4'));
-- cannot touch an approved story
update posts set title = 'hacked' where id = '00000000-0000-0000-0000-0000000000d2';
select rls.check('kid: cannot edit an approved story', (select title from posts where id = '00000000-0000-0000-0000-0000000000d2') = 'for guests');
delete from posts where id = '00000000-0000-0000-0000-0000000000d1';
select rls.check('kid: cannot delete a parent''s story', exists (select 1 from posts where id = '00000000-0000-0000-0000-0000000000d1'));
-- photos on own open story: allowed; a public copy path: refused
insert into post_photos (post_id, photo_id) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c2');
select rls.check('kid: can attach a photo to own open story',
  exists (select 1 from post_photos where post_id = '00000000-0000-0000-0000-0000000000e1'));
do $$ begin
  insert into post_photos (post_id, photo_id, public_path) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 'x/y.jpg');
  raise exception 'FAIL  kid: public_path insert should be refused';
exception when insufficient_privilege then raise notice 'PASS  kid: cannot set a public copy path';
end $$;
do $$ begin
  insert into post_photos (post_id, photo_id) values ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c1');
  raise exception 'FAIL  kid: attaching to an approved story should be refused';
exception when insufficient_privilege or unique_violation then raise notice 'PASS  kid: cannot attach photos to a published story';
end $$;
reset role;

-- owner: a kid's story can never be public
set local role authenticated; select rls.as_owner();
do $$ begin
  update posts set status = 'approved', visibility = 'public' where id = '00000000-0000-0000-0000-0000000000e1';
  raise exception 'FAIL  owner: kid story went public';
exception when insufficient_privilege then raise notice 'PASS  owner: a kid''s story cannot be made public';
end $$;
update posts set status = 'approved', visibility = 'guests' where id = '00000000-0000-0000-0000-0000000000e1';
select rls.check('owner: approving a kid story stamps approver',
  (select approved_by = '00000000-0000-0000-0000-0000000000b1' and published_at is not null from posts where id = '00000000-0000-0000-0000-0000000000e1'));
reset role;

-- guest: only approved guests stories past publish_after; only shared photos
set local role authenticated; select rls.as_guest();
select rls.check('guest: sees the 2 published guests stories only',
  (select array_agg(title order by title) from posts) = array['for guests', 'kid story v2']);
select rls.check('guest: post_photos shows the shared photo only',
  (select array_agg(photo_id) from post_photos) = array['00000000-0000-0000-0000-0000000000c1'::uuid]);
do $$ begin
  insert into posts (trip_id, author_id, title) values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', 'guest post');
  raise exception 'FAIL  guest could write a story';
exception when insufficient_privilege then raise notice 'PASS  guest: cannot write a story';
end $$;
update posts set title = 'x';
select rls.check('guest: updates nothing', not exists (select 1 from posts where title = 'x'));
select rls.check('guest: cannot read the guest list (labels included)', (select count(*) from guests_allowlist) = 0);
reset role;

set local role authenticated; select rls.as_revoked();
select rls.check('revoked guest: sees no stories', (select count(*) from posts) = 0 and (select count(*) from post_photos) = 0);
reset role;

set local role authenticated; select rls.as_outsider();
select rls.check('signed-in stranger: sees no stories', (select count(*) from posts) = 0);
reset role;

set local role anon; select rls.as_anon();
select rls.check('anon: sees no non-public stories', (select count(*) from posts where visibility <> 'public') = 0);
reset role;

-- owner: guest labels are writable
set local role authenticated; select rls.as_owner();
update guests_allowlist set labels = array['כיתה ב׳'] where email = 'guest@probe.test';
select rls.check('owner: can label a guest', (select labels from guests_allowlist where email = 'guest@probe.test') = array['כיתה ב׳']);
reset role;

rollback;
