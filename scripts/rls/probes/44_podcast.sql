-- 00044: podcast episodes + audio bucket.
begin;
\i scripts/rls/seed.sql

-- parents record (00049: kids no longer do); the kid-rules trigger still
-- holds for a row that names a kid as recorder
set local role authenticated; select rls.as_kid();
do $$ begin
  insert into episodes (trip_id, recorded_by, title, file_path) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'kid take', 'a/k.webm');
  raise exception 'FAIL  kid recorded an episode';
exception when insufficient_privilege then raise notice 'PASS  kid: cannot record (00049)';
end $$;
do $$ begin
  insert into storage.objects (bucket_id, name) values ('audio', 'a/k.webm');
  raise exception 'FAIL  kid uploaded audio';
exception when insufficient_privilege then raise notice 'PASS  kid: cannot upload audio (00049)';
end $$;
reset role;

set local role authenticated; select rls.as_owner();
insert into episodes (id, trip_id, recorded_by, title, file_path, status) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'ep 1 renamed', 'a/1.webm', 'pending');
insert into storage.objects (bucket_id, name) values ('audio', 'a/1.webm');
select rls.check('owner: records into the audio bucket', exists (select 1 from storage.objects where bucket_id = 'audio'));
reset role;

set local role authenticated; select rls.as_kid();
select rls.check('kid: a pending episode is not there yet', (select count(*) from episodes) = 0);
reset role;

-- guest before approval: nothing
set local role authenticated; select rls.as_guest();
select rls.check('guest: pending episode invisible', (select count(*) from episodes) = 0);
reset role;

-- owner approves only
set local role authenticated; select rls.as_owner();
update episodes set status = 'approved' where id = '00000000-0000-0000-0000-0000000000f1';
reset role;
set local role authenticated; select rls.as_guest();
select rls.check('guest: approved but unshared episode invisible', (select count(*) from episodes) = 0);
reset role;

-- owner shares
set local role authenticated; select rls.as_owner();
update episodes set shared_with_guests = true where id = '00000000-0000-0000-0000-0000000000f1';
reset role;
set local role authenticated; select rls.as_guest();
select rls.check('guest: approved + shared episode visible', (select count(*) from episodes) = 1);
select rls.check('guest: cannot read the audio bucket', (select count(*) from storage.objects where bucket_id = 'audio') = 0);
do $$ begin
  insert into storage.objects (bucket_id, name) values ('audio', 'g/evil.webm');
  raise exception 'FAIL  guest uploaded audio';
exception when insufficient_privilege then raise notice 'PASS  guest: cannot upload audio';
end $$;
reset role;

-- kid hears the approved episode and cannot edit or delete it
set local role authenticated; select rls.as_kid();
select rls.check('kid: hears the approved episode', (select count(*) from episodes) = 1);
update episodes set title = 'changed after approval' where id = '00000000-0000-0000-0000-0000000000f1';
delete from episodes where id = '00000000-0000-0000-0000-0000000000f1';
select rls.check('kid: approved episode is frozen', (select title from episodes where id = '00000000-0000-0000-0000-0000000000f1') = 'ep 1 renamed');
reset role;

-- withdrawing approval withdraws sharing
set local role authenticated; select rls.as_owner();
update episodes set status = 'rejected' where id = '00000000-0000-0000-0000-0000000000f1';
select rls.check('owner: un-approving also un-shares',
  (select not shared_with_guests from episodes where id = '00000000-0000-0000-0000-0000000000f1'));
update episodes set status = 'approved' where id = '00000000-0000-0000-0000-0000000000f1';
reset role;
set local role authenticated; select rls.as_guest();
select rls.check('guest: re-approval alone does not re-share', (select count(*) from episodes) = 0);
reset role;

set local role authenticated; select rls.as_revoked();
select rls.check('revoked guest: no episodes', (select count(*) from episodes) = 0);
reset role;
set local role anon; select rls.as_anon();
-- (storage.objects is not probed as anon: a pre-existing documents-bucket
-- policy calls a function anon may not execute, so any anon read of
-- storage.objects errors before reaching the audio policies - deny either way)
select rls.check('anon: no episodes', (select count(*) from episodes) = 0);
reset role;

rollback;
