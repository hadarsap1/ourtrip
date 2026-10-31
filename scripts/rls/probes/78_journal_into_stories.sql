-- 00078: one journal. A kid's family entry needs no parent and stays between
-- that kid and the parents; anything wider still waits for a parent; guests
-- see only what went out to them; the old journal table is closed.
begin;
\i scripts/rls/seed.sql

-- a second kid, to check that a kid's diary stays theirs
insert into members (id, trip_id, display_name, role) values
  ('00000000-0000-0000-0000-0000000008b5', '00000000-0000-0000-0000-0000000000a1', 'Kid2', 'kid');
insert into kid_devices (member_id, device_token_hash, pin_hash, approved_by) values
  ('00000000-0000-0000-0000-0000000008b5', 'y', 'y', '00000000-0000-0000-0000-0000000000b1');
create or replace function rls.as_kid2() returns void language sql as $$
  select set_config('request.jwt.claims', '{"member_id":"00000000-0000-0000-0000-0000000008b5","role":"authenticated"}', true) $$;
grant execute on function rls.as_kid2() to authenticated;
-- a kid's own photo to attach
insert into photos (id, trip_id, uploaded_by, file_path) values
  ('00000000-0000-0000-0000-0000000008c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'k/mine.jpg');

-- ---------- owner ----------
set local role authenticated; select rls.as_owner();
insert into posts (id, trip_id, author_id, body, mood, status, visibility) values
  ('00000000-0000-0000-0000-0000000008a1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'parent line, no title', '🙂', 'approved', 'family');
select rls.check('owner: a family entry needs no title',
  (select title is null and entry_date = current_date from posts where id = '00000000-0000-0000-0000-0000000008a1'));
do $$ begin
  insert into posts (trip_id, author_id, body, status, visibility) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'untitled blog', 'approved', 'public');
  raise exception 'FAIL  owner: public entry without a title was accepted';
exception when check_violation then raise notice 'PASS  owner: a public entry needs a title';
end $$;
reset role;

-- ---------- kid writes ----------
set local role authenticated; select rls.as_kid();
insert into posts (id, trip_id, author_id, body, mood, status) values
  ('00000000-0000-0000-0000-0000000008a2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'kid diary', '🤩', 'approved');
select rls.check('kid: a family entry is saved at once, no approver',
  (select status = 'approved' and visibility = 'family' and approved_by is null and published_at is not null
     from posts where id = '00000000-0000-0000-0000-0000000008a2'));
update posts set body = 'kid diary, edited' where id = '00000000-0000-0000-0000-0000000008a2';
select rls.check('kid: editing a family entry keeps it saved',
  (select status = 'approved' and body = 'kid diary, edited' from posts where id = '00000000-0000-0000-0000-0000000008a2'));
insert into post_photos (post_id, photo_id) values ('00000000-0000-0000-0000-0000000008a2', '00000000-0000-0000-0000-0000000008c1');
select rls.check('kid: adds a photo to own saved family entry',
  exists (select 1 from post_photos where post_id = '00000000-0000-0000-0000-0000000008a2'));
select rls.check('kid: the photo stays pending (DECISIONS #5)',
  (select status = 'pending' and not shared_with_guests from photos where id = '00000000-0000-0000-0000-0000000008c1'));
-- asks to share with friends: pending, still family
insert into posts (id, trip_id, author_id, title, body, status, visibility) values
  ('00000000-0000-0000-0000-0000000008a3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', null, 'for my friends', 'pending', 'guests');
select rls.check('kid: an entry for friends waits for a parent, audience family',
  (select status = 'pending' and visibility = 'family' from posts where id = '00000000-0000-0000-0000-0000000008a3'));
select rls.check('kid: reads the parent''s family entry',
  exists (select 1 from posts where id = '00000000-0000-0000-0000-0000000008a1'));
reset role;

-- ---------- the other kid ----------
set local role authenticated; select rls.as_kid2();
select rls.check('kid2: does not read another kid''s family entry',
  not exists (select 1 from posts where id in ('00000000-0000-0000-0000-0000000008a2', '00000000-0000-0000-0000-0000000008a3')));
select rls.check('kid2: reads the parent''s family entry',
  exists (select 1 from posts where id = '00000000-0000-0000-0000-0000000008a1'));
reset role;

-- ---------- guest before a parent acts ----------
set local role authenticated; select rls.as_guest();
select rls.check('guest: no family entry, no pending entry',
  not exists (select 1 from posts where id in ('00000000-0000-0000-0000-0000000008a1', '00000000-0000-0000-0000-0000000008a2', '00000000-0000-0000-0000-0000000008a3')));
select rls.check('guest: the old journal table is not readable',
  not has_table_privilege('journal_entries_archive_00078', 'select')
  or not exists (select 1 from pg_policies where tablename = 'journal_entries_archive_00078'));
reset role;

-- ---------- owner publishes the kid's entry to guests ----------
set local role authenticated; select rls.as_owner();
update posts set status = 'approved', visibility = 'guests' where id = '00000000-0000-0000-0000-0000000008a3';
select rls.check('owner: publishes a kid''s entry to guests, stamped',
  (select approved_by = '00000000-0000-0000-0000-0000000000b1' from posts where id = '00000000-0000-0000-0000-0000000008a3'));
reset role;

set local role authenticated; select rls.as_guest();
select rls.check('guest: reads the published entry (title is optional)',
  exists (select 1 from posts where id = '00000000-0000-0000-0000-0000000008a3'));
reset role;
set local role authenticated; select rls.as_kid2();
select rls.check('kid2: reads another kid''s entry once it went out',
  exists (select 1 from posts where id = '00000000-0000-0000-0000-0000000008a3'));
reset role;

-- ---------- kid on a published entry ----------
set local role authenticated; select rls.as_kid();
update posts set body = 'changed after' where id = '00000000-0000-0000-0000-0000000008a3';
select rls.check('kid: editing an entry that went out sends it back to a parent',
  (select status = 'pending' and visibility = 'guests' from posts where id = '00000000-0000-0000-0000-0000000008a3'));
update posts set status = 'approved' where id = '00000000-0000-0000-0000-0000000008a3';
select rls.check('kid: cannot re-approve an entry for guests',
  (select status = 'pending' from posts where id = '00000000-0000-0000-0000-0000000008a3'));
delete from posts where id = '00000000-0000-0000-0000-0000000008a1';
select rls.check('kid: cannot delete a parent''s entry',
  exists (select 1 from posts where id = '00000000-0000-0000-0000-0000000008a1'));
delete from posts where id = '00000000-0000-0000-0000-0000000008a2';
select rls.check('kid: deletes own family entry',
  not exists (select 1 from posts where id = '00000000-0000-0000-0000-0000000008a2'));
reset role;

set local role authenticated; select rls.as_guest();
select rls.check('guest: the edited entry is gone until a parent approves again',
  not exists (select 1 from posts where id = '00000000-0000-0000-0000-0000000008a3'));
reset role;

-- ---------- anon ----------
set local role anon; select rls.as_anon();
select rls.check('anon: no family entry', (select count(*) from posts where visibility = 'family') = 0);
reset role;

rollback;
