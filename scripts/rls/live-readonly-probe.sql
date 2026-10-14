-- Live smoke of the sharing policies (00043-00047) on the real project.
-- Inserts and reads only (no UPDATE/DELETE), inside one transaction that is
-- always rolled back: the final block raises with the report, which aborts
-- the transaction. Run through the Supabase SQL tool; the error message IS
-- the result. Edit/delete rules are covered by scripts/rls/probes on a
-- local database with the same migrations.
begin;
set local statement_timeout = '15s';
create schema if not exists rls;
grant usage on schema rls to anon, authenticated;
create temp table rls_results (n serial, label text, ok boolean);
grant all on rls_results to anon, authenticated;
grant usage on sequence rls_results_n_seq to anon, authenticated;
create or replace function rls.check(label text, ok boolean) returns void
language sql as $$ insert into pg_temp.rls_results (label, ok) values (label, coalesce(ok, false)) $$;

insert into trips (id, name) values ('00000000-0000-0000-0000-0000000000a1', 'probe');
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000aa01', 'owner@probe.test'),
  ('00000000-0000-0000-0000-00000000aa03', 'guest@probe.test'),
  ('00000000-0000-0000-0000-00000000aa04', 'gone@probe.test'),
  ('00000000-0000-0000-0000-00000000aa05', 'outsider@probe.test');
insert into members (id, trip_id, auth_user_id, email, display_name, role) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000aa01', 'owner@probe.test', 'Owner', 'owner'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1', null, null, 'Kid', 'kid'),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000aa03', 'guest@probe.test', 'Guest', 'guest'),
  ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000aa04', 'gone@probe.test', 'Revoked', 'guest');
insert into guests_allowlist (trip_id, email, invited_by, revoked_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'guest@probe.test', '00000000-0000-0000-0000-0000000000b1', null),
  ('00000000-0000-0000-0000-0000000000a1', 'gone@probe.test', '00000000-0000-0000-0000-0000000000b1', now());
insert into kid_devices (member_id, device_token_hash, pin_hash, approved_by) values
  ('00000000-0000-0000-0000-0000000000b2', 'x', 'x', '00000000-0000-0000-0000-0000000000b1');
insert into photos (id, trip_id, uploaded_by, file_path, status, shared_with_guests) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'p/shared.jpg', 'approved', true),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'p/unshared.jpg', 'approved', false);
create or replace function rls.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000aa01","email":"owner@probe.test","role":"authenticated"}', true) $$;
create or replace function rls.as_kid() returns void language sql as $$
  select set_config('request.jwt.claims', '{"member_id":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true) $$;
create or replace function rls.as_guest() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000aa03","email":"guest@probe.test","role":"authenticated"}', true) $$;
create or replace function rls.as_revoked() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000aa04","email":"gone@probe.test","role":"authenticated"}', true) $$;
create or replace function rls.as_outsider() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000aa05","email":"outsider@probe.test","role":"authenticated"}', true) $$;
create or replace function rls.as_anon() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"anon"}', true) $$;
grant execute on all functions in schema rls to anon, authenticated;

-- ---------- parent writes ----------
set local role authenticated; select rls.as_owner();
insert into posts (id, trip_id, author_id, title, status, visibility) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'family only', 'approved', 'family'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'for guests', 'approved', 'guests'),
  ('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'public now', 'approved', 'public');
insert into posts (id, trip_id, author_id, title, status, visibility, publish_after) values
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'later', 'approved', 'guests', now() + interval '2 days');
insert into post_photos (post_id, photo_id, position, public_path) values
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c1', 0, null),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c2', 1, null),
  ('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000c1', 0, 'probe/d5/c1.jpg');
insert into episodes (id, trip_id, recorded_by, title, file_path, status, shared_with_guests) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'shared ep', 'a/1.m4a', 'approved', true),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'family ep', 'a/2.m4a', 'approved', false);
select rls.check('owner: approval stamps published_at + approver', (select published_at is not null and approved_by = '00000000-0000-0000-0000-0000000000b1' from posts where id = '00000000-0000-0000-0000-0000000000d2'));
select rls.check('owner: a public story gets a 12-char slug', (select char_length(public_slug) = 12 from posts where id = '00000000-0000-0000-0000-0000000000d5'));
select rls.check('owner: sees all 4 stories and both episodes', (select count(*) from posts) = 4 and (select count(*) from episodes) = 2);
reset role;

-- ---------- kid ----------
set local role authenticated; select rls.as_kid();
insert into posts (id, trip_id, author_id, title, status, visibility, approved_by) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'kid story', 'approved', 'public', '00000000-0000-0000-0000-0000000000b2');
select rls.check('kid: own story forced to pending / family / unapproved', (select status = 'pending' and visibility = 'family' and approved_by is null from posts where id = '00000000-0000-0000-0000-0000000000e1'));
insert into episodes (id, trip_id, recorded_by, title, file_path, status, shared_with_guests) values
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'kid ep', 'a/3.m4a', 'approved', true);
select rls.check('kid: own recording forced to pending + unshared', (select status = 'pending' and not shared_with_guests from episodes where id = '00000000-0000-0000-0000-0000000000f3'));
insert into reactions (trip_id, member_id, post_id, kind) values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000d1', 'star');
select rls.check('kid: can like a family story', (select count(*) from reactions) = 1);
do $$ begin
  insert into comments (trip_id, author_id, post_id, body) values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000d1', 'x');
  perform rls.check('kid: wrote a comment', false); return;
exception when insufficient_privilege then perform rls.check('kid: cannot write comments', true);
end $$;
reset role;

-- ---------- guest ----------
set local role authenticated; select rls.as_guest();
select rls.check('guest: sees guests + public stories only (no family, pending or scheduled)',
  (select array_agg(title order by title) from posts) = array['for guests', 'public now']);
select rls.check('guest: story photos only where the photo itself is shared',
  (select array_agg(photo_id::text order by post_id) from post_photos) = array['00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1']);
select rls.check('guest: hears only the approved + shared episode', (select array_agg(title) from episodes) = array['shared ep']);
insert into comments (id, trip_id, author_id, post_id, body) values ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000d2', 'כל הכבוד!');
insert into reactions (trip_id, member_id, post_id, kind) values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000d2', 'heart');
select rls.check('guest: comments and likes a guests story', (select count(*) from comments) = 1);
select rls.check('guest: does not see the kid''s like on a family story', not exists (select 1 from reactions where kind = 'star'));
do $$ begin
  insert into comments (trip_id, author_id, post_id, body) values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000d1', 'x');
  perform rls.check('guest: commented a family story', false); return;
exception when insufficient_privilege then perform rls.check('guest: cannot comment a story they cannot see', true);
end $$;
do $$ begin
  insert into posts (trip_id, author_id, title) values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', 'guest post');
  perform rls.check('guest: wrote a story', false); return;
exception when insufficient_privilege then perform rls.check('guest: cannot write a story', true);
end $$;
insert into messages (trip_id, sender_id, body, channel, origin_message_id, bridged_by, bridged_context) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', 'fake', 'guests', null, '00000000-0000-0000-0000-0000000000b1', 'shared by a parent');
select rls.check('guest: bridge columns stripped from own message', (select bridged_by is null and bridged_context is null from messages where body = 'fake'));
select rls.check('guest: cannot read the guest list', (select count(*) from guests_allowlist) = 0);
reset role;

-- ---------- kid again: likes yes, comments never ----------
set local role authenticated; select rls.as_kid();
select rls.check('kid: sees the guest''s like', exists (select 1 from reactions where kind = 'heart'));
select rls.check('kid: sees no comments at all', (select count(*) from comments) = 0);
reset role;

-- ---------- parent bridges the comment ----------
set local role authenticated; select rls.as_owner();
insert into messages (trip_id, sender_id, body, channel, origin_comment_id, bridged_by, bridged_context) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', 'כל הכבוד!', 'family', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-0000000000b1', 'על הסיפור: for guests');
reset role;
set local role authenticated; select rls.as_kid();
select rls.check('kid: the bridged comment arrives in the family feed with context', (select bridged_context from messages where origin_comment_id is not null) = 'על הסיפור: for guests');
reset role;

-- ---------- revoked, stranger, anon ----------
set local role authenticated; select rls.as_revoked();
-- a revoked guest is a stranger again: the public story, like anyone with the link, and nothing else
select rls.check('revoked guest: back to public-only - no guests stories, episodes or comments',
  (select array_agg(title) from posts) = array['public now'] and (select count(*) from episodes) = 0 and (select count(*) from comments) = 0);
reset role;
set local role authenticated; select rls.as_outsider();
select rls.check('signed-in stranger: only the public story', (select array_agg(title) from posts) = array['public now'] and (select count(*) from episodes) = 0);
reset role;
set local role anon; select rls.as_anon();
select rls.check('anon: exactly the live public story', (select array_agg(title) from posts) = array['public now']);
select rls.check('anon: only its copied photo path', (select array_agg(public_path) from post_photos) = array['probe/d5/c1.jpg']);
select rls.check('anon: no photos, members, episodes, comments, likes',
  (select count(*) from photos) = 0 and (select count(*) from members) = 0 and (select count(*) from episodes) = 0
  and (select count(*) from comments) = 0 and (select count(*) from reactions) = 0);
reset role;

select rls.check('buckets: audio private 50 MB with wav, public-stories public',
  (select not public and file_size_limit = 52428800 and 'audio/wav' = any(allowed_mime_types) from storage.buckets where id = 'audio')
  and (select public from storage.buckets where id = 'public-stories'));

do $$ declare r text; begin
  select string_agg(case when ok then 'PASS ' else 'FAIL ' end || label, ' | ' order by n) into r from pg_temp.rls_results;
  raise exception 'REPORT % passed / % total :: %',
    (select count(*) filter (where ok) from pg_temp.rls_results), (select count(*) from pg_temp.rls_results), r;
end $$;
