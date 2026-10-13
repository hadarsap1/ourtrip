-- 00047: replacing an episode's audio is a parent's action only.
begin;
\i scripts/rls/seed.sql

set local role authenticated; select rls.as_kid();
insert into episodes (id, trip_id, recorded_by, title, file_path) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'take', 'a/original.webm');
update episodes set file_path = 'a/swapped.wav', mime_type = 'audio/wav' where id = '00000000-0000-0000-0000-0000000000f1';
select rls.check('kid: cannot swap the audio of own pending take',
  (select file_path from episodes where id = '00000000-0000-0000-0000-0000000000f1') = 'a/original.webm');
reset role;

set local role authenticated; select rls.as_owner();
update episodes set status = 'approved' where id = '00000000-0000-0000-0000-0000000000f1';
update episodes set shared_with_guests = true where id = '00000000-0000-0000-0000-0000000000f1';
update episodes set file_path = 'a/edited.wav', mime_type = 'audio/wav', duration_seconds = 42, title = 'take (edited)'
 where id = '00000000-0000-0000-0000-0000000000f1';
select rls.check('owner: replaces the audio; approval and sharing stay as they were',
  (select file_path = 'a/edited.wav' and status = 'approved' and shared_with_guests and duration_seconds = 42
     from episodes where id = '00000000-0000-0000-0000-0000000000f1'));
reset role;

set local role authenticated; select rls.as_guest();
update episodes set file_path = 'g/evil.wav';
select rls.check('guest: cannot touch the audio', (select file_path from episodes) = 'a/edited.wav');
reset role;

select rls.check('bucket accepts the edited WAV',
  (select 'audio/wav' = any(allowed_mime_types) from storage.buckets where id = 'audio'));

rollback;
