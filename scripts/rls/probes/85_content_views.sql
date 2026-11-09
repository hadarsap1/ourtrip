-- 00085: guests' views of updates, photos and episodes. A guest records only
-- their own view of what they can see (rule 3 for photos); only parents read
-- who saw what; kids, revoked guests, outsiders and anon get nothing.
begin;
\i scripts/rls/seed.sql

-- seed (as the superuser): d1 an update for guests, d2 family only;
-- f1 an episode shared with guests (10 minutes), f2 approved but not shared.
-- Photos from seed.sql: c1 approved + shared, c2 approved but not shared.
insert into posts (id, trip_id, author_id, title, status, visibility) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'for guests', 'approved', 'guests'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'family only', 'approved', 'family');
insert into episodes (id, trip_id, recorded_by, title, file_path, status, shared_with_guests, duration_seconds) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'shared', 'a/1.wav', 'approved', true, 600),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'family', 'a/2.wav', 'approved', false, 600);

-- ---------- guest ----------
set local role authenticated;
select rls.as_guest();
select public.record_content_view(p_post_id => '00000000-0000-0000-0000-0000000000d1');
select public.record_content_view(p_post_id => '00000000-0000-0000-0000-0000000000d1');
select public.record_content_view(p_photo_id => '00000000-0000-0000-0000-0000000000c1');
select public.record_content_view(p_episode_id => '00000000-0000-0000-0000-0000000000f1', p_heard_seconds => 120);
select public.record_content_view(p_episode_id => '00000000-0000-0000-0000-0000000000f1', p_heard_seconds => 30);
select rls.check('guest: records an update, a photo and an episode they can see, once each',
  (select count(*) from content_views) = 3
  and (select count(*) from content_views where post_id = '00000000-0000-0000-0000-0000000000d1') = 1);
select rls.check('guest: heard time never goes down',
  (select heard_seconds from content_views where episode_id = '00000000-0000-0000-0000-0000000000f1') = 120);
select public.record_content_view(p_episode_id => '00000000-0000-0000-0000-0000000000f1', p_heard_seconds => 5000);
select rls.check('guest: heard time stops at the episode''s length',
  (select heard_seconds from content_views where episode_id = '00000000-0000-0000-0000-0000000000f1') = 600);

-- what the guest cannot see records nothing (rule 3, family-only update, unshared episode)
select public.record_content_view(p_photo_id => '00000000-0000-0000-0000-0000000000c2');
select public.record_content_view(p_post_id => '00000000-0000-0000-0000-0000000000d2');
select public.record_content_view(p_episode_id => '00000000-0000-0000-0000-0000000000f2');
select rls.check('guest: an unshared photo, a family update and an unshared episode record nothing',
  (select count(*) from content_views) = 3);
do $$ begin
  insert into content_views (trip_id, member_id, photo_id) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000c2');
  raise exception 'FAIL  guest: inserted a view of an unshared photo';
exception when insufficient_privilege then null;
end $$;
select rls.check('guest: a direct insert of an unshared photo is refused', true);
do $$ begin
  insert into content_views (trip_id, member_id, photo_id) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000c1');
  raise exception 'FAIL  guest: recorded a view in someone else''s name';
exception when insufficient_privilege then null;
end $$;
select rls.check('guest: cannot record a view for another member', true);
do $$ begin
  update content_views set member_id = '00000000-0000-0000-0000-0000000000b4';
  raise exception 'FAIL  guest: moved a view to another member';
exception when insufficient_privilege then null;
end $$;
select rls.check('guest: cannot move a view to another member or target', true);
reset role;

-- a second guest's view, written as the superuser, so "reads own only" means something
insert into content_views (trip_id, member_id, post_id) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000d1');

set local role authenticated;
select rls.as_guest();
select rls.check('guest: reads back only their own views, never who else saw it',
  (select count(*) from content_views) = 3
  and not exists (select 1 from content_views where member_id <> '00000000-0000-0000-0000-0000000000b3'));
reset role;

-- ---------- revoked guest ----------
set local role authenticated;
select rls.as_revoked();
select public.record_content_view(p_photo_id => '00000000-0000-0000-0000-0000000000c1');
select rls.check('revoked guest: records nothing and reads nothing', not exists (select 1 from content_views));
reset role;
select rls.check('revoked guest: no new row was written',
  (select count(*) from content_views where member_id = '00000000-0000-0000-0000-0000000000b4') = 1);

-- ---------- kid ----------
set local role authenticated;
select rls.as_kid();
select public.record_content_view(p_photo_id => '00000000-0000-0000-0000-0000000000c1');
select rls.check('kid: is not counted and reads no views', not exists (select 1 from content_views));
do $$ begin
  insert into content_views (trip_id, member_id, photo_id) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c1');
  raise exception 'FAIL  kid: inserted a view';
exception when insufficient_privilege then null;
end $$;
select rls.check('kid: a direct insert is refused', true);
reset role;

-- ---------- parent ----------
set local role authenticated;
select rls.as_owner();
select rls.check('parent: reads every guest''s views of the trip',
  (select count(*) from content_views) = 4);
select public.record_content_view(p_photo_id => '00000000-0000-0000-0000-0000000000c2');
select rls.check('parent: their own opening is not counted',
  (select count(*) from content_views) = 4);
-- no delete policy: the delete matches no row (or is refused outright)
do $$ begin
  delete from content_views;
exception when insufficient_privilege then null;
end $$;
select rls.check('parent: cannot delete views', (select count(*) from content_views) = 4);
reset role;

-- ---------- outsider / anon ----------
set local role authenticated;
select rls.as_outsider();
select public.record_content_view(p_photo_id => '00000000-0000-0000-0000-0000000000c1');
select rls.check('outsider: records and reads nothing', not exists (select 1 from content_views));
reset role;

set local role anon;
select rls.as_anon();
do $$ begin
  perform public.record_content_view(p_photo_id => '00000000-0000-0000-0000-0000000000c1');
  raise exception 'FAIL  anon: could call record_content_view';
exception when insufficient_privilege then null;
end $$;
select rls.check('anon: cannot record a view', true);
do $$ begin
  perform 1 from content_views;
  raise exception 'FAIL  anon: could read content_views';
exception when insufficient_privilege then null;
end $$;
select rls.check('anon: cannot read views', true);
reset role;

rollback;
