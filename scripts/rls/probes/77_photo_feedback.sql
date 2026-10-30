-- 00077: likes and comments on photos. A guest reaches a photo's feedback only
-- while the photo passes rule 3 for them; kids read and like, never comment.
begin;
\i scripts/rls/seed.sql

-- seed: c1 approved + shared, c2 approved but not shared (seed.sql);
-- c7 approved + shared but only for a group the probe guest is not in;
-- c8 a kid's photo still waiting for approval
insert into photos (id, trip_id, uploaded_by, file_path, status, shared_with_guests, audience) values
  ('00000000-0000-0000-0000-0000000000c7', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'p/group.jpg', 'approved', true, array['other group']);
insert into photos (id, trip_id, uploaded_by, file_path) values
  ('00000000-0000-0000-0000-0000000000c8', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'k/pending.jpg');

-- a parent's comment on each photo, as the parent
set local role authenticated;
select rls.as_owner();
insert into comments (trip_id, author_id, photo_id, body)
select '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', id, 'parent on ' || file_path
  from photos where id in ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2',
                           '00000000-0000-0000-0000-0000000000c7', '00000000-0000-0000-0000-0000000000c8');
insert into reactions (trip_id, member_id, photo_id, kind) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c2', 'heart');
select rls.check('parent: comments and likes on any photo of the trip',
  (select count(*) from comments where photo_id is not null) = 4 and (select count(*) from reactions where photo_id is not null) = 1);
reset role;

-- ---------- guest ----------
set local role authenticated;
select rls.as_guest();
insert into comments (trip_id, author_id, photo_id, body) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000c1', 'wow');
insert into reactions (trip_id, member_id, photo_id, kind) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000c1', 'heart');
select rls.check('guest: comments on and likes a photo shared with them',
  exists (select 1 from comments where body = 'wow') and exists (select 1 from reactions where photo_id = '00000000-0000-0000-0000-0000000000c1'));
select rls.check('guest: reads the comments of a shared photo only (not unshared, other group, pending)',
  (select count(*) from comments where photo_id is not null) = 2
  and not exists (select 1 from comments where photo_id <> '00000000-0000-0000-0000-0000000000c1'));
select rls.check('guest: sees no like on a photo not shared with them',
  not exists (select 1 from reactions where photo_id = '00000000-0000-0000-0000-0000000000c2'));
do $$
declare target uuid;
begin
  foreach target in array array['00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c7', '00000000-0000-0000-0000-0000000000c8']::uuid[] loop
    begin
      insert into comments (trip_id, author_id, photo_id, body)
      values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', target, 'sneaky');
      raise exception 'FAIL  guest: commented on photo % that is not shared with them', target;
    exception when insufficient_privilege then null;
    end;
    begin
      insert into reactions (trip_id, member_id, photo_id, kind)
      values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', target, 'star');
      raise exception 'FAIL  guest: liked photo % that is not shared with them', target;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;
select rls.check('guest: cannot comment on or like an unshared, other-group or pending photo', true);

update comments set photo_id = '00000000-0000-0000-0000-0000000000c2' where body = 'wow';
reset role;
select rls.check('guest: editing a comment cannot move it to another photo',
  (select photo_id from comments where body = 'wow') = '00000000-0000-0000-0000-0000000000c1');

-- ---------- kid ----------
set local role authenticated;
select rls.as_kid();
select rls.check('kid: reads the comments on the trip''s photos',
  (select count(*) from comments where photo_id is not null) = 5);
insert into reactions (trip_id, member_id, photo_id, kind) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c1', 'smile');
select rls.check('kid: likes a photo', exists (select 1 from reactions where member_id = '00000000-0000-0000-0000-0000000000b2'));
do $$ begin
  insert into comments (trip_id, author_id, photo_id, body)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c1', 'hi');
  raise exception 'FAIL  kid: wrote a comment';
exception when insufficient_privilege then null;
end $$;
select rls.check('kid: cannot write a comment on a photo', true);
reset role;

-- ---------- outsiders ----------
set local role authenticated;
select rls.as_revoked();
select rls.check('revoked guest: no photo comments or likes',
  not exists (select 1 from comments where photo_id is not null) and not exists (select 1 from reactions where photo_id is not null));
select rls.as_outsider();
select rls.check('outsider: no photo comments or likes',
  not exists (select 1 from comments where photo_id is not null) and not exists (select 1 from reactions where photo_id is not null));
reset role;
set local role anon;
select rls.as_anon();
select rls.check('anon: no photo comments or likes',
  not exists (select 1 from comments where photo_id is not null) and not exists (select 1 from reactions where photo_id is not null));
reset role;

-- ---------- shape ----------
insert into posts (id, trip_id, author_id, title, status) values
  ('00000000-0000-0000-0000-0000000007f1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'a story', 'approved');
do $$ begin
  insert into comments (trip_id, author_id, photo_id, post_id, body) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
     '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000007f1', 'two targets');
  if found then raise exception 'FAIL  a comment with two targets was saved'; end if;
exception when check_violation then null;
end $$;
select rls.check('a comment or like has exactly one target', true);
select rls.check('only the 4-argument feedback_target_visible remains',
  (select count(*) from pg_proc where proname = 'feedback_target_visible') = 1);

rollback;
