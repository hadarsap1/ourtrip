-- 00084: only owners move a photo to another day (taken_on). A kid's update
-- of their own photo keeps the day; a guest changes nothing.
begin;
\i scripts/rls/seed.sql

insert into photos (id, trip_id, uploaded_by, file_path, status, taken_on) values
  ('00000000-0000-0000-0000-0000000084c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2',
   'p/kid84.jpg', 'pending', '2026-11-04');

-- owner moves the kid's photo and their own
set local role authenticated; select rls.as_owner();
update photos set taken_on = '2026-11-01' where id = '00000000-0000-0000-0000-0000000084c1';
update photos set taken_on = '2026-10-30' where id = '00000000-0000-0000-0000-0000000000c1';
select rls.check('owner: moves a kid''s photo to another day',
  (select taken_on from photos where id = '00000000-0000-0000-0000-0000000084c1') = '2026-11-01');
select rls.check('owner: moves their own photo to another day',
  (select taken_on from photos where id = '00000000-0000-0000-0000-0000000000c1') = '2026-10-30');
reset role;

-- kid: the day stays, the caption still changes
set local role authenticated; select rls.as_kid();
update photos set taken_on = '2026-10-01', caption = 'kid text' where id = '00000000-0000-0000-0000-0000000084c1';
reset role;
select rls.check('kid: cannot move their own photo to another day',
  (select taken_on from photos where id = '00000000-0000-0000-0000-0000000084c1') = '2026-11-01');
select rls.check('kid: the caption in the same update still saves',
  (select caption from photos where id = '00000000-0000-0000-0000-0000000084c1') = 'kid text');

-- kid: a parent's photo is not theirs to touch at all
set local role authenticated; select rls.as_kid();
update photos set taken_on = '2026-10-01' where id = '00000000-0000-0000-0000-0000000000c1';
reset role;
select rls.check('kid: cannot move a parent''s photo',
  (select taken_on from photos where id = '00000000-0000-0000-0000-0000000000c1') = '2026-10-30');

-- guest: no update policy
set local role authenticated; select rls.as_guest();
update photos set taken_on = '2026-10-01';
reset role;
select rls.check('guest: moves no photo',
  (select count(*) from photos where taken_on = '2026-10-01') = 0);

rollback;
