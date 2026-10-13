-- 00044: podcast episodes + audio bucket.
begin;
\i scripts/rls/seed.sql

-- kid records, claims approval and sharing
set local role authenticated; select rls.as_kid();
insert into episodes (id, trip_id, recorded_by, title, file_path, status, shared_with_guests, approved_by) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'ep 1', 'a/1.webm', 'approved', true, '00000000-0000-0000-0000-0000000000b2');
select rls.check('kid insert: forced pending + unshared',
  (select status = 'pending' and not shared_with_guests and approved_by is null from episodes where id = '00000000-0000-0000-0000-0000000000f1'));
update episodes set status = 'approved', shared_with_guests = true, title = 'ep 1 renamed' where id = '00000000-0000-0000-0000-0000000000f1';
select rls.check('kid update: title only, approval and sharing frozen',
  (select status = 'pending' and not shared_with_guests and title = 'ep 1 renamed' from episodes where id = '00000000-0000-0000-0000-0000000000f1'));
insert into storage.objects (bucket_id, name) values ('audio', 'a/1.webm');
select rls.check('kid: can upload to the audio bucket', exists (select 1 from storage.objects where bucket_id = 'audio'));
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

-- kid can no longer edit or delete an approved recording
set local role authenticated; select rls.as_kid();
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
