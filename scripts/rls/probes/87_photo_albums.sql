-- 00087: photo albums. Parents create and share albums; parents and kids add
-- photos; a guest sees a shared album and, in it, only the photos rule 3
-- already lets them see.
begin;
\i scripts/rls/seed.sql

-- a kid's pending photo next to the seed's shared (c1) and unshared (c2) ones
insert into photos (id, trip_id, uploaded_by, file_path, status) values
  ('00000000-0000-0000-0000-0000000087c3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'p/kid87.jpg', 'pending');

-- owner: creates two albums, one shared, and fills them
set local role authenticated; select rls.as_owner();
insert into albums (id, trip_id, name, shared_with_guests, created_by) values
  ('00000000-0000-0000-0000-0000000087a1', '00000000-0000-0000-0000-0000000000a1', 'אווירה', true, '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000087a2', '00000000-0000-0000-0000-0000000000a1', 'פרטי', false, '00000000-0000-0000-0000-0000000000b1');
insert into album_photos (album_id, photo_id, added_by) values
  ('00000000-0000-0000-0000-0000000087a1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000087a1', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000087a2', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1');
select rls.check('owner: creates albums and adds photos', (select count(*) from album_photos) = 3);
update albums set name = 'אווירה בדרך' where id = '00000000-0000-0000-0000-0000000087a1';
select rls.check('owner: renames an album', (select name from albums where id = '00000000-0000-0000-0000-0000000087a1') = 'אווירה בדרך');
reset role;

-- owner: cannot create an album in another member's name
set local role authenticated; select rls.as_owner();
savepoint s1;
do $$ begin
  insert into albums (trip_id, name, created_by) values
    ('00000000-0000-0000-0000-0000000000a1', 'x', '00000000-0000-0000-0000-0000000000b2');
  raise exception 'inserted';
exception when insufficient_privilege then null; end $$;
release savepoint s1;
reset role;
select rls.check('owner: an album is created as themselves', not exists (select 1 from albums where created_by = '00000000-0000-0000-0000-0000000000b2'));

-- kid: sees every album and the photos in them, adds their own photo
set local role authenticated; select rls.as_kid();
select rls.check('kid: sees both albums', (select count(*) from albums) = 2);
select rls.check('kid: sees every album row', (select count(*) from album_photos) = 3);
insert into album_photos (album_id, photo_id, added_by) values
  ('00000000-0000-0000-0000-0000000087a1', '00000000-0000-0000-0000-0000000087c3', '00000000-0000-0000-0000-0000000000b2');
select rls.check('kid: adds their photo to an album', (select count(*) from album_photos where added_by = '00000000-0000-0000-0000-0000000000b2') = 1);
-- adding in a parent's name
savepoint s2;
do $$ begin
  insert into album_photos (album_id, photo_id, added_by) values
    ('00000000-0000-0000-0000-0000000087a2', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1');
  raise exception 'inserted';
exception when insufficient_privilege then null; end $$;
release savepoint s2;
-- removing what a parent added: nothing happens
delete from album_photos where added_by = '00000000-0000-0000-0000-0000000000b1';
-- albums are a parent's
update albums set shared_with_guests = true where id = '00000000-0000-0000-0000-0000000087a2';
delete from albums;
savepoint s3;
do $$ begin
  insert into albums (trip_id, name, created_by) values
    ('00000000-0000-0000-0000-0000000000a1', 'kid', '00000000-0000-0000-0000-0000000000b2');
  raise exception 'inserted';
exception when insufficient_privilege then null; end $$;
release savepoint s3;
reset role;
select rls.check('kid: cannot add in a parent''s name', not exists (select 1 from album_photos where album_id = '00000000-0000-0000-0000-0000000087a2' and photo_id = '00000000-0000-0000-0000-0000000000c2'));
select rls.check('kid: cannot remove what a parent added', (select count(*) from album_photos where added_by = '00000000-0000-0000-0000-0000000000b1') = 3);
select rls.check('kid: cannot share, delete or create an album',
  (select count(*) from albums) = 2
  and not (select shared_with_guests from albums where id = '00000000-0000-0000-0000-0000000087a2'));

set local role authenticated; select rls.as_kid();
delete from album_photos where added_by = '00000000-0000-0000-0000-0000000000b2';
reset role;
select rls.check('kid: removes what they added', not exists (select 1 from album_photos where added_by = '00000000-0000-0000-0000-0000000000b2'));
insert into album_photos (album_id, photo_id, added_by) values
  ('00000000-0000-0000-0000-0000000087a1', '00000000-0000-0000-0000-0000000087c3', '00000000-0000-0000-0000-0000000000b2');

-- guest: the shared album only, and in it only the approved+shared photo
set local role authenticated; select rls.as_guest();
select rls.check('guest: sees only the shared album', (select count(*) from albums) = 1
  and (select id from albums) = '00000000-0000-0000-0000-0000000087a1');
select rls.check('guest: sees only rule-3 photos in it (not the unshared, not the pending)',
  (select count(*) from album_photos) = 1
  and (select photo_id from album_photos) = '00000000-0000-0000-0000-0000000000c1');
reset role;

-- guest: an album in another group's photo stays hidden (00063)
update photos set audience = '{class}' where id = '00000000-0000-0000-0000-0000000000c1';
set local role authenticated; select rls.as_guest();
select rls.check('guest: a group photo outside their groups is not in the album', (select count(*) from album_photos) = 0);
reset role;
update photos set audience = '{}' where id = '00000000-0000-0000-0000-0000000000c1';

-- guest: writes nothing
set local role authenticated; select rls.as_guest();
savepoint s4;
do $$ begin
  insert into album_photos (album_id, photo_id, added_by) values
    ('00000000-0000-0000-0000-0000000087a1', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b3');
  raise exception 'inserted';
exception when insufficient_privilege then null; end $$;
release savepoint s4;
delete from album_photos;
update albums set name = 'guest';
delete from albums;
reset role;
select rls.check('guest: adds, removes, renames and deletes nothing',
  (select count(*) from album_photos) = 4 and (select count(*) from albums) = 2
  and not exists (select 1 from albums where name = 'guest'));

-- revoked guest: nothing at all
set local role authenticated; select rls.as_revoked();
select rls.check('revoked guest: no albums', (select count(*) from albums) = 0 and (select count(*) from album_photos) = 0);
reset role;

-- unsharing the album hides it again; unsharing the photo empties it
set local role authenticated; select rls.as_owner();
update albums set shared_with_guests = false where id = '00000000-0000-0000-0000-0000000087a1';
reset role;
set local role authenticated; select rls.as_guest();
select rls.check('guest: an unshared album disappears with its rows', (select count(*) from albums) = 0 and (select count(*) from album_photos) = 0);
reset role;

-- deleting a photo takes it out of every album; deleting an album empties it
set local role authenticated; select rls.as_owner();
delete from photos where id = '00000000-0000-0000-0000-0000000000c1';
select rls.check('owner: a deleted photo leaves its albums', not exists (select 1 from album_photos where photo_id = '00000000-0000-0000-0000-0000000000c1'));
delete from albums where id = '00000000-0000-0000-0000-0000000087a1';
select rls.check('owner: a deleted album takes its rows', not exists (select 1 from album_photos where album_id = '00000000-0000-0000-0000-0000000087a1'));
reset role;

rollback;
