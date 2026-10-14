-- 00049: one wall with kid approval, parent-recorded podcast with comments
-- the kids can read, owner-only documents.
begin;
\i scripts/rls/seed.sql

-- ---------- the wall ----------
set local role authenticated; select rls.as_kid();
insert into messages (id, trip_id, sender_id, body, channel, approved_at, approved_by) values
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2',
   'שלום לכולם!', 'guests', now(), '00000000-0000-0000-0000-0000000000b2');
select rls.check('kid: own message lands pending whatever is sent',
  (select approved_at is null and approved_by is null from messages where id = '00000000-0000-0000-0000-000000000301'));
select rls.check('kid: sees own pending message', (select count(*) from messages) = 1);
do $$ begin
  insert into messages (trip_id, sender_id, body, channel) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'x', 'family');
  raise exception 'FAIL  kid wrote to the family feed';
exception when insufficient_privilege then raise notice 'PASS  kid: the family feed is closed';
end $$;
update messages set approved_at = now() where id = '00000000-0000-0000-0000-000000000301';
select rls.check('kid: cannot approve own message',
  (select approved_at is null from messages where id = '00000000-0000-0000-0000-000000000301'));
reset role;

set local role authenticated; select rls.as_guest();
select rls.check('guest: pending kid message invisible', (select count(*) from messages) = 0);
insert into messages (id, trip_id, sender_id, body, channel, approved_at) values
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', 'נסיעה טובה', 'guests', null);
select rls.check('guest: own message goes out at once',
  (select approved_at is not null and approved_by is null from messages where id = '00000000-0000-0000-0000-000000000302'));
reset role;

set local role authenticated; select rls.as_kid();
select rls.check('kid: reads the guest''s message', exists (select 1 from messages where id = '00000000-0000-0000-0000-000000000302'));
reset role;

set local role authenticated; select rls.as_owner();
select rls.check('owner: sees the pending kid message', exists (select 1 from messages where approved_at is null));
insert into message_reads (message_id, member_id) values ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-0000000000b1');
update messages set approved_at = now() where id = '00000000-0000-0000-0000-000000000301';
select rls.check('owner: approval is stamped with the approving parent',
  (select approved_by = '00000000-0000-0000-0000-0000000000b1' from messages where id = '00000000-0000-0000-0000-000000000301'));
reset role;

set local role authenticated; select rls.as_guest();
select rls.check('guest: approved kid message visible', exists (select 1 from messages where id = '00000000-0000-0000-0000-000000000301'));
reset role;

-- a second kid message, rejected (deleted) after a parent read it
set local role authenticated; select rls.as_kid();
insert into messages (id, trip_id, sender_id, body, channel) values
  ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'לא לשלוח', 'guests');
reset role;
set local role authenticated; select rls.as_owner();
insert into message_reads (message_id, member_id) values ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-0000000000b1');
delete from messages where id = '00000000-0000-0000-0000-000000000303';
select rls.check('owner: rejecting a read message works (reads cascade)',
  not exists (select 1 from messages where id = '00000000-0000-0000-0000-000000000303'));
reset role;

-- a kid takes back a pending message, but not an approved one
set local role authenticated; select rls.as_kid();
insert into messages (id, trip_id, sender_id, body, channel) values
  ('00000000-0000-0000-0000-000000000304', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'טעות', 'guests');
delete from messages where id in ('00000000-0000-0000-0000-000000000304', '00000000-0000-0000-0000-000000000301');
select rls.check('kid: takes back a pending message only',
  not exists (select 1 from messages where id = '00000000-0000-0000-0000-000000000304')
  and exists (select 1 from messages where id = '00000000-0000-0000-0000-000000000301'));
reset role;

set local role authenticated; select rls.as_revoked();
select rls.check('revoked guest: no messages', (select count(*) from messages) = 0);
reset role;

-- ---------- podcast comments ----------
set local role authenticated; select rls.as_owner();
insert into episodes (id, trip_id, recorded_by, title, file_path, status, shared_with_guests) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'ep', 'a/e.webm', 'approved', true),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'draft', 'a/d.webm', 'pending', false);
insert into posts (id, trip_id, author_id, title, status, visibility) values
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'for guests', 'approved', 'guests');
insert into comments (trip_id, author_id, episode_id, body) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f2', 'on the draft');
reset role;
set local role authenticated; select rls.as_guest();
insert into comments (trip_id, author_id, episode_id, body) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000f1', 'איזה פרק!');
insert into comments (trip_id, author_id, post_id, body) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000d2', 'על הסיפור');
reset role;

set local role authenticated; select rls.as_kid();
select rls.check('kid: reads the listener''s comment on an episode', (select count(*) from comments where body = 'איזה פרק!') = 1);
select rls.check('kid: no comments on an episode they cannot hear', (select count(*) from comments where body = 'on the draft') = 0);
select rls.check('kid: reads story comments too (00050)', (select count(*) from comments where post_id is not null) = 1);
do $$ begin
  insert into comments (trip_id, author_id, episode_id, body) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000f1', 'x');
  raise exception 'FAIL  kid wrote a comment';
exception when insufficient_privilege then raise notice 'PASS  kid: comments are read-only';
end $$;
delete from comments;
reset role;
select rls.check('kid: cannot delete comments', (select count(*) from comments) = 3);

-- ---------- documents ----------
set local role authenticated; select rls.as_owner();
insert into documents (trip_id, title, tag, file_path) values
  ('00000000-0000-0000-0000-0000000000a1', 'passport', 'passport', 'd/p.pdf');
reset role;
set local role authenticated; select rls.as_kid();
select rls.check('kid: reads no documents', (select count(*) from documents) = 0);
reset role;
select rls.check('no "share with kids" left on documents',
  not exists (select 1 from information_schema.columns where table_name = 'documents' and column_name = 'shared_with_kids')
  and not exists (select 1 from pg_policies where policyname in ('documents_kid_select', 'documents_kid_read')));

rollback;
