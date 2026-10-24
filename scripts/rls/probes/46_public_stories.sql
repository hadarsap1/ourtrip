-- 00046: public stories.
begin;
\i scripts/rls/seed.sql

set local role authenticated; select rls.as_owner();
insert into posts (id, trip_id, author_id, title, status, visibility) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'public now', 'approved', 'public'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'guests only', 'approved', 'guests'),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'public draft', 'draft', 'public');
insert into posts (id, trip_id, author_id, title, status, visibility, publish_after) values
  ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'public later', 'approved', 'public', now() + interval '1 day');
insert into post_photos (post_id, photo_id, public_path) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'trip/d1/c1.jpg'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c2', null);
select rls.check('owner: going public mints a slug',
  (select public_slug is not null and char_length(public_slug) = 12 from posts where id = '00000000-0000-0000-0000-0000000000d1'));
insert into storage.objects (bucket_id, name) values ('public-stories', 'trip/d1/c1.jpg');
select rls.check('owner: can write the public bucket', exists (select 1 from storage.objects where bucket_id = 'public-stories'));
reset role;

set local role anon; select rls.as_anon();
select rls.check('anon: reads exactly the one live public story',
  (select array_agg(title) from posts) = array['public now']);
select rls.check('anon: sees only the copied photo path',
  (select array_agg(public_path) from post_photos) = array['trip/d1/c1.jpg']);
select rls.check('anon: no photos rows', (select count(*) from photos) = 0);
select rls.check('anon: no members (author stays anonymous)', (select count(*) from members) = 0);
select rls.check('anon: no comments, no reactions', (select count(*) from comments) = 0 and (select count(*) from reactions) = 0);
do $$ begin
  insert into comments (trip_id, author_id, post_id, body) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', 'spam');
  raise exception 'FAIL  anon commented';
exception when insufficient_privilege then raise notice 'PASS  anon: cannot comment';
end $$;
update posts set title = 'defaced';
select rls.check('anon: cannot edit', not exists (select 1 from posts where title = 'defaced'));
reset role;

set local role authenticated; select rls.as_outsider();
select rls.check('signed-in stranger: same as anon (public only)', (select array_agg(title) from posts) = array['public now']);
reset role;

set local role authenticated; select rls.as_guest();
select rls.check('guest: sees guests + live public stories',
  (select array_agg(title order by title) from posts) = array['guests only', 'public now']);
do $$ begin
  insert into storage.objects (bucket_id, name) values ('public-stories', 'g/evil.jpg');
  raise exception 'FAIL  guest wrote to the public bucket';
exception when insufficient_privilege then raise notice 'PASS  guest: cannot write the public bucket';
end $$;
reset role;

set local role authenticated; select rls.as_kid();
do $$ begin
  insert into storage.objects (bucket_id, name) values ('public-stories', 'k/x.jpg');
  raise exception 'FAIL  kid wrote to the public bucket';
exception when insufficient_privilege then raise notice 'PASS  kid: cannot write the public bucket';
end $$;
reset role;

-- unpublishing takes it off the public page at once
set local role authenticated; select rls.as_owner();
update posts set visibility = 'guests' where id = '00000000-0000-0000-0000-0000000000d1';
reset role;
set local role anon; select rls.as_anon();
select rls.check('anon: unpublished story is gone, and its photo rows with it',
  (select count(*) from posts) = 0 and (select count(*) from post_photos) = 0);
reset role;

rollback;
