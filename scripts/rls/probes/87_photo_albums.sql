-- 00087: photo albums. A photo uploaded into an album belongs to it. Parents
-- create and share albums; a parent's upload into a shared album is shared at
-- once; a kid's waits. Guests see album photos only while the album is shared
-- and only under rule 3.
begin;
\i scripts/rls/seed.sql

-- owner: two albums, one shared
set local role authenticated; select rls.as_owner();
insert into albums (id, trip_id, name, shared_with_guests, created_by) values
  ('00000000-0000-0000-0000-0000000087a1', '00000000-0000-0000-0000-0000000000a1', 'אווירה', true, '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000087a2', '00000000-0000-0000-0000-0000000000a1', 'פרטי', false, '00000000-0000-0000-0000-0000000000b1');
-- parent uploads into both: shared one with the share, private one without
insert into photos (id, trip_id, uploaded_by, file_path, status, approved_by, shared_with_guests, album_id) values
  ('00000000-0000-0000-0000-0000000087c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'p/a1.jpg', 'approved', '00000000-0000-0000-0000-0000000000b1', true, '00000000-0000-0000-0000-0000000087a1'),
  ('00000000-0000-0000-0000-0000000087c2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'p/a2.jpg', 'approved', '00000000-0000-0000-0000-0000000000b1', true, '00000000-0000-0000-0000-0000000087a2'),
  ('00000000-0000-0000-0000-0000000087c4', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'p/a4.jpg', 'approved', '00000000-0000-0000-0000-0000000000b1', false, '00000000-0000-0000-0000-0000000087a1');
select rls.check('owner: uploads into albums', (select count(*) from photos where album_id is not null) = 3);
select rls.check('a shared album photo gets album_shared_at, an unshared one does not',
  (select album_shared_at is not null from photos where id = '00000000-0000-0000-0000-0000000087c1')
  and (select album_shared_at is null from photos where id = '00000000-0000-0000-0000-0000000087c4'));
update albums set name = 'אווירה בדרך' where id = '00000000-0000-0000-0000-0000000087a1';
select rls.check('owner: renames an album', (select name from albums where id = '00000000-0000-0000-0000-0000000087a1') = 'אווירה בדרך');
-- a photo cannot move into, out of or between albums
savepoint s0;
do $$ begin
  update photos set album_id = null where id = '00000000-0000-0000-0000-0000000087c1';
  raise exception 'moved';
exception when insufficient_privilege then null; end $$;
release savepoint s0;
select rls.check('owner: cannot take a photo out of its album', (select album_id from photos where id = '00000000-0000-0000-0000-0000000087c1') = '00000000-0000-0000-0000-0000000087a1');
reset role;

-- owner: an album in another member's name is refused
set local role authenticated; select rls.as_owner();
savepoint s1;
do $$ begin
  insert into albums (trip_id, name, created_by) values ('00000000-0000-0000-0000-0000000000a1', 'x', '00000000-0000-0000-0000-0000000000b2');
  raise exception 'inserted';
exception when insufficient_privilege then null; end $$;
release savepoint s1;
reset role;
select rls.check('owner: an album is created as themselves', not exists (select 1 from albums where created_by = '00000000-0000-0000-0000-0000000000b2'));

-- kid: sees every album; uploads into one - forced pending and unshared
set local role authenticated; select rls.as_kid();
select rls.check('kid: sees both albums', (select count(*) from albums) = 2);
insert into photos (id, trip_id, uploaded_by, file_path, status, shared_with_guests, album_id) values
  ('00000000-0000-0000-0000-0000000087c3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'p/kid87.jpg', 'approved', true, '00000000-0000-0000-0000-0000000087a1');
update albums set shared_with_guests = true where id = '00000000-0000-0000-0000-0000000087a2';
delete from albums;
savepoint s3;
do $$ begin
  insert into albums (trip_id, name, created_by) values ('00000000-0000-0000-0000-0000000000a1', 'kid', '00000000-0000-0000-0000-0000000000b2');
  raise exception 'inserted';
exception when insufficient_privilege then null; end $$;
release savepoint s3;
reset role;
select rls.check('kid: upload into an album lands pending, unshared, not yet new to guests',
  (select status = 'pending' and not shared_with_guests and album_shared_at is null from photos where id = '00000000-0000-0000-0000-0000000087c3'));
select rls.check('kid: cannot share, delete or create an album',
  (select count(*) from albums) = 2 and not (select shared_with_guests from albums where id = '00000000-0000-0000-0000-0000000087a2'));

-- an album of another trip is refused for an upload
insert into trips (id, name) values ('00000000-0000-0000-0000-0000000087f1', 'other');
insert into albums (id, trip_id, name, created_by) values
  ('00000000-0000-0000-0000-0000000087a9', '00000000-0000-0000-0000-0000000087f1', 'other', '00000000-0000-0000-0000-0000000000b1');
set local role authenticated; select rls.as_owner();
savepoint s5;
do $$ begin
  insert into photos (trip_id, uploaded_by, file_path, album_id) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'p/x.jpg', '00000000-0000-0000-0000-0000000087a9');
  raise exception 'inserted';
exception when insufficient_privilege then null; end $$;
release savepoint s5;
reset role;
select rls.check('nobody uploads into another trip''s album', not exists (select 1 from photos where album_id = '00000000-0000-0000-0000-0000000087a9'));

-- guest: the shared album only; in it only approved+shared photos
set local role authenticated; select rls.as_guest();
select rls.check('guest: sees only the shared album', (select count(*) from albums) = 1 and (select id from albums) = '00000000-0000-0000-0000-0000000087a1');
select rls.check('guest: album photos = approved AND shared only (not the unshared, not the kid''s pending)',
  (select count(*) from photos where album_id is not null) = 1
  and exists (select 1 from photos where id = '00000000-0000-0000-0000-0000000087c1'));
select rls.check('guest: a shared photo in an unshared album stays hidden',
  not exists (select 1 from photos where id = '00000000-0000-0000-0000-0000000087c2'));
select rls.check('guest: the seed''s ordinary shared photo is still there', exists (select 1 from photos where id = '00000000-0000-0000-0000-0000000000c1'));
reset role;

-- parent approves and shares the kid's photo: it becomes new to guests now
update photos set status = 'approved', approved_by = '00000000-0000-0000-0000-0000000000b1', shared_with_guests = true
 where id = '00000000-0000-0000-0000-0000000087c3';
select rls.check('approved + shared kid photo gets album_shared_at', (select album_shared_at is not null from photos where id = '00000000-0000-0000-0000-0000000087c3'));
set local role authenticated; select rls.as_guest();
select rls.check('guest: sees the kid''s photo once approved and shared', exists (select 1 from photos where id = '00000000-0000-0000-0000-0000000087c3'));
reset role;

-- group photo outside the guest's groups stays hidden in the album (00063)
update photos set audience = '{class}' where id = '00000000-0000-0000-0000-0000000087c1';
set local role authenticated; select rls.as_guest();
select rls.check('guest: a group photo outside their groups is not in the album', not exists (select 1 from photos where id = '00000000-0000-0000-0000-0000000087c1'));
reset role;

-- guest: writes nothing on albums
set local role authenticated; select rls.as_guest();
update albums set name = 'guest';
delete from albums;
reset role;
select rls.check('guest: renames and deletes no album', (select count(*) from albums) = 3 and not exists (select 1 from albums where name = 'guest'));

-- revoked guest: nothing
set local role authenticated; select rls.as_revoked();
select rls.check('revoked guest: no albums, no album photos', (select count(*) from albums) = 0 and (select count(*) from photos) = 0);
reset role;

-- unsharing the album hides every photo in it at once
set local role authenticated; select rls.as_owner();
update albums set shared_with_guests = false where id = '00000000-0000-0000-0000-0000000087a1';
reset role;
set local role authenticated; select rls.as_guest();
select rls.check('guest: an unshared album hides itself and all its photos',
  (select count(*) from albums) = 0 and (select count(*) from photos where album_id is not null) = 0);
reset role;

-- deleting an album deletes its photos' rows
set local role authenticated; select rls.as_owner();
delete from albums where id = '00000000-0000-0000-0000-0000000087a1';
select rls.check('owner: a deleted album takes its photos', not exists (select 1 from photos where album_id = '00000000-0000-0000-0000-0000000087a1'));
reset role;

rollback;
