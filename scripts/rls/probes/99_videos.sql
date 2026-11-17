-- 00099: a short video is a `photos` row with media_type = 'video', so the
-- photo rules decide it: a kid's lands pending and unshared, a guest reads it
-- only approved AND shared (rule 3), a kid cannot change what the file is.
begin;
\i scripts/rls/seed.sql

-- kid uploads a video and tries to pass it as approved and shared
set local role authenticated; select rls.as_kid();
insert into photos (id, trip_id, uploaded_by, file_path, media_type, poster_path, duration_seconds, status, shared_with_guests)
values ('00000000-0000-0000-0000-0000000099c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2',
        'p/kid99.mp4', 'video', 'p/kid99.poster.jpg', 20, 'approved', true);
reset role;
select rls.check('kid: an uploaded video lands pending',
  (select status from photos where id = '00000000-0000-0000-0000-0000000099c1') = 'pending');
select rls.check('kid: an uploaded video lands unshared',
  (select shared_with_guests from photos where id = '00000000-0000-0000-0000-0000000099c1') = false);

-- guest: not a pending video
set local role authenticated; select rls.as_guest();
select rls.check('guest: does not see a kid''s pending video',
  (select count(*) from photos where id = '00000000-0000-0000-0000-0000000099c1') = 0);
reset role;

-- owner approves; sharing is still its own step
set local role authenticated; select rls.as_owner();
update photos set status = 'approved', approved_by = '00000000-0000-0000-0000-0000000000b1'
 where id = '00000000-0000-0000-0000-0000000099c1';
reset role;
set local role authenticated; select rls.as_guest();
select rls.check('guest: does not see an approved video that is not shared (rule 3)',
  (select count(*) from photos where id = '00000000-0000-0000-0000-0000000099c1') = 0);
reset role;
set local role authenticated; select rls.as_owner();
update photos set shared_with_guests = true where id = '00000000-0000-0000-0000-0000000099c1';
reset role;
set local role authenticated; select rls.as_guest();
select rls.check('guest: sees a video approved AND shared',
  (select count(*) from photos where id = '00000000-0000-0000-0000-0000000099c1' and media_type = 'video') = 1);
reset role;

-- kid: what the file is stays as uploaded; the caption still changes
set local role authenticated; select rls.as_kid();
update photos set media_type = 'image', poster_path = null, duration_seconds = null, caption = 'kid text'
 where id = '00000000-0000-0000-0000-0000000099c1';
reset role;
select rls.check('kid: cannot turn their video into a photo',
  (select media_type from photos where id = '00000000-0000-0000-0000-0000000099c1') = 'video');
select rls.check('kid: cannot change the poster or the length',
  (select poster_path = 'p/kid99.poster.jpg' and duration_seconds = 20 from photos where id = '00000000-0000-0000-0000-0000000099c1'));
select rls.check('kid: the caption in the same update still saves',
  (select caption from photos where id = '00000000-0000-0000-0000-0000000099c1') = 'kid text');

-- guest: no insert policy
do $$ begin
  set local role authenticated; perform rls.as_guest();
  insert into photos (trip_id, uploaded_by, file_path, media_type, duration_seconds)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', 'p/guest.mp4', 'video', 5);
  raise notice 'FAIL  guest: uploaded a video';
exception when insufficient_privilege then raise notice 'PASS  guest: cannot upload a video';
end $$;
reset role;

-- the shape of a row (as the owner, who may write anything RLS allows)
do $$ begin
  insert into photos (trip_id, uploaded_by, file_path, media_type, duration_seconds)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'p/long.mp4', 'video', 300);
  raise notice 'FAIL  a five-minute video was accepted';
exception when check_violation then raise notice 'PASS  a video longer than a minute is refused';
end $$;
do $$ begin
  insert into photos (trip_id, uploaded_by, file_path, media_type)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'p/nolength.mp4', 'video');
  raise notice 'FAIL  a video with no length was accepted';
exception when check_violation then raise notice 'PASS  a video must say its length';
end $$;
do $$ begin
  insert into photos (trip_id, uploaded_by, file_path, media_type)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'p/x.gif', 'gif');
  raise notice 'FAIL  an unknown media type was accepted';
exception when check_violation then raise notice 'PASS  only image and video are media types';
end $$;
do $$ begin
  insert into photos (trip_id, uploaded_by, file_path, poster_path)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'p/x.jpg', 'p/x.poster.jpg');
  raise notice 'FAIL  a photo with a poster was accepted';
exception when check_violation then raise notice 'PASS  a photo carries no poster';
end $$;
select rls.check('photos from before 00099 are images',
  (select count(*) from photos where id in ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2')
     and media_type = 'image' and poster_path is null and duration_seconds is null) = 2);

-- storage: the private bucket takes video up to 50 MB; the open blog's never
select rls.check('photos bucket: private, 50 MB, takes video/mp4',
  (select public = false and file_size_limit = 52428800 and 'video/mp4' = any(allowed_mime_types)
     and 'image/jpeg' = any(allowed_mime_types) from storage.buckets where id = 'photos'));
select rls.check('public-stories bucket takes no video',
  (select not exists (select 1 from unnest(allowed_mime_types) t where t like 'video/%')
     from storage.buckets where id = 'public-stories'));

rollback;
