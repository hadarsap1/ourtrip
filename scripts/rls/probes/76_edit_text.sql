-- 00076: editing text after it is published. The writer and parents may edit;
-- a non-parent's edit changes the text only; a kid's edit of approved text
-- goes back to a parent; the public blog hides a photo that stopped qualifying.
begin;
\i scripts/rls/seed.sql

-- as the superuser: approved rows to edit
insert into messages (id, trip_id, sender_id, body, channel) values
  ('00000000-0000-0000-0000-0000000007a1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'kid says hi', 'guests'),
  ('00000000-0000-0000-0000-0000000007a2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', 'guest says hi', 'guests'),
  ('00000000-0000-0000-0000-0000000007a3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'parent says hi', 'guests');
-- a parent's bridge copy of the kid's message, carrying the kid as sender
-- (made as the parent: messages_bridge_guard strips the copy marks otherwise)
set local role authenticated;
select rls.as_owner();
insert into messages (id, trip_id, sender_id, body, channel, origin_message_id, bridged_by) values
  ('00000000-0000-0000-0000-0000000007a4', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'copy', 'guests',
   '00000000-0000-0000-0000-0000000007a1', '00000000-0000-0000-0000-0000000000b1');
reset role;
select rls.check('seed: the copy is marked as a bridge copy',
  (select origin_message_id is not null from messages where id = '00000000-0000-0000-0000-0000000007a4'));
insert into posts (id, trip_id, author_id, title, body, status, visibility) values
  ('00000000-0000-0000-0000-0000000007b1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'kid story', 'old', 'approved', 'guests'),
  ('00000000-0000-0000-0000-0000000007b2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'parent story', 'old', 'approved', 'public');
insert into comments (id, trip_id, author_id, post_id, body) values
  ('00000000-0000-0000-0000-0000000007c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000007b2', 'nice'),
  ('00000000-0000-0000-0000-0000000007c2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000007b2', 'thanks');
insert into photos (id, trip_id, uploaded_by, file_path) values
  ('00000000-0000-0000-0000-0000000007d1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'k/approved.jpg');
update photos set status = 'approved', shared_with_guests = true, caption = 'old'
 where id = '00000000-0000-0000-0000-0000000007d1';
insert into post_photos (post_id, photo_id, public_path) values
  ('00000000-0000-0000-0000-0000000007b2', '00000000-0000-0000-0000-0000000007d1', 'pub/approved.jpg');
insert into journal_entries (id, trip_id, author_id, body) values
  ('00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'kid diary'),
  ('00000000-0000-0000-0000-0000000007e2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'parent diary');

select rls.check('seed: both messages start approved',
  (select count(*) from messages where id in ('00000000-0000-0000-0000-0000000007a1', '00000000-0000-0000-0000-0000000007a2') and approved_at is not null) = 2);

-- ---------- public blog sees the photo while it qualifies ----------
set local role anon;
select rls.as_anon();
select rls.check('anon: public story shows the approved, shared photo',
  (select count(*) from post_photos where post_id = '00000000-0000-0000-0000-0000000007b2') = 1);
reset role;

-- ---------- kid ----------
set local role authenticated;
select rls.as_kid();

update messages set body = 'kid says hi, edited', channel = 'family', audience = '{x}'
 where id = '00000000-0000-0000-0000-0000000007a1';
select rls.check('kid: edits own message text',
  (select body from messages where id = '00000000-0000-0000-0000-0000000007a1') = 'kid says hi, edited');

update messages set body = 'hacked' where id = '00000000-0000-0000-0000-0000000007a2';
update messages set body = 'hacked copy' where id = '00000000-0000-0000-0000-0000000007a4';
update messages set body = 'hacked' where id = '00000000-0000-0000-0000-0000000007a3';

update posts set body = 'new', title = 'kid story 2', audience = '{x}' where id = '00000000-0000-0000-0000-0000000007b1';
select rls.check('kid: edits own approved story',
  (select body from posts where id = '00000000-0000-0000-0000-0000000007b1') = 'new');
update posts set body = 'hacked' where id = '00000000-0000-0000-0000-0000000007b2';

update photos set caption = 'new words' where id = '00000000-0000-0000-0000-0000000007d1';
update journal_entries set body = 'kid diary, edited' where id = '00000000-0000-0000-0000-0000000007e1';
update journal_entries set body = 'hacked' where id = '00000000-0000-0000-0000-0000000007e2';
select rls.check('kid: edits own journal entry',
  (select body from journal_entries where id = '00000000-0000-0000-0000-0000000007e1') = 'kid diary, edited');

do $$ begin
  update comments set body = 'hacked' where id = '00000000-0000-0000-0000-0000000007c1';
  if found then raise exception 'FAIL  kid: changed a comment'; end if;
end $$;
reset role;

select rls.check('kid edit: message is off the guests'' wall until a parent approves again',
  (select approved_at is null and approved_by is null from messages where id = '00000000-0000-0000-0000-0000000007a1'));
select rls.check('kid edit: channel and audience stay as they were',
  (select channel = 'guests' and audience = '{}' from messages where id = '00000000-0000-0000-0000-0000000007a1'));
select rls.check('kid: cannot edit a guest''s or a parent''s message',
  (select count(*) from messages where body = 'hacked') = 0);
select rls.check('kid: cannot edit a parent''s bridge copy of their message',
  (select body from messages where id = '00000000-0000-0000-0000-0000000007a4') = 'copy');
select rls.check('kid edit: approved story is back to pending, visibility and audience as the parent published it',
  (select status = 'pending' and visibility = 'guests' and audience = '{}' from posts where id = '00000000-0000-0000-0000-0000000007b1'));
select rls.check('kid: cannot edit a parent''s story',
  (select body from posts where id = '00000000-0000-0000-0000-0000000007b2') = 'old');
select rls.check('kid edit: approved photo with new caption is back to pending (rule 3: hidden from guests)',
  (select status = 'pending' and caption = 'new words' from photos where id = '00000000-0000-0000-0000-0000000007d1'));
select rls.check('kid: cannot edit a parent''s journal entry',
  (select body from journal_entries where id = '00000000-0000-0000-0000-0000000007e2') = 'parent diary');

-- ---------- public blog stops showing the photo now that it is pending ----------
set local role anon;
select rls.as_anon();
select rls.check('anon: public story no longer shows the photo waiting for approval',
  (select count(*) from post_photos where post_id = '00000000-0000-0000-0000-0000000007b2') = 0);
reset role;

-- ---------- guest ----------
set local role authenticated;
select rls.as_guest();

update messages set body = 'guest says hi, edited', audience = '{x}', sender_id = '00000000-0000-0000-0000-0000000000b1'
 where id = '00000000-0000-0000-0000-0000000007a2';
update messages set body = 'hacked' where id = '00000000-0000-0000-0000-0000000007a3';
update comments set body = 'very nice', post_id = null, episode_id = null, shown_to_kids_at = now()
 where id = '00000000-0000-0000-0000-0000000007c1';
update comments set body = 'hacked' where id = '00000000-0000-0000-0000-0000000007c2';
do $$ begin
  update posts set body = 'hacked' where id = '00000000-0000-0000-0000-0000000007b2';
  if found then raise exception 'FAIL  guest: changed a story'; end if;
  update journal_entries set body = 'hacked';
  if found then raise exception 'FAIL  guest: changed a journal entry'; end if;
end $$;
reset role;

select rls.check('guest: edits own message text, stays approved, sender and audience pinned',
  (select body = 'guest says hi, edited' and approved_at is not null and audience = '{}'
          and sender_id = '00000000-0000-0000-0000-0000000000b3'
     from messages where id = '00000000-0000-0000-0000-0000000007a2'));
select rls.check('guest: cannot edit a parent''s message',
  (select body from messages where id = '00000000-0000-0000-0000-0000000007a3') = 'parent says hi');
select rls.check('guest: edits own comment text, target and kid-bridge stamp pinned',
  (select body = 'very nice' and post_id = '00000000-0000-0000-0000-0000000007b2' and shown_to_kids_at is null
     from comments where id = '00000000-0000-0000-0000-0000000007c1'));
select rls.check('guest: cannot edit a parent''s comment',
  (select body from comments where id = '00000000-0000-0000-0000-0000000007c2') = 'thanks');

-- ---------- revoked guest ----------
set local role authenticated;
select rls.as_revoked();
do $$ begin
  update messages set body = 'hacked' where sender_id = '00000000-0000-0000-0000-0000000000b4';
  update comments set body = 'hacked' where author_id = '00000000-0000-0000-0000-0000000000b4';
end $$;
reset role;
select rls.check('revoked guest: edits nothing',
  not exists (select 1 from messages where body = 'hacked') and not exists (select 1 from comments where body = 'hacked'));

-- ---------- parent ----------
set local role authenticated;
select rls.as_owner();
update messages set body = 'parent fixed it', approved_at = now() where id = '00000000-0000-0000-0000-0000000007a1';
update comments set body = 'parent fixed it' where id = '00000000-0000-0000-0000-0000000007c1';
update posts set body = 'parent fixed it', status = 'approved' where id = '00000000-0000-0000-0000-0000000007b1';
update journal_entries set body = 'parent fixed it' where id = '00000000-0000-0000-0000-0000000007e1';
reset role;
select rls.check('parent: edits anyone''s message and re-approves it',
  (select body = 'parent fixed it' and approved_at is not null from messages where id = '00000000-0000-0000-0000-0000000007a1'));
select rls.check('parent: edits a guest''s comment',
  (select body from comments where id = '00000000-0000-0000-0000-0000000007c1') = 'parent fixed it');
select rls.check('parent: edits a kid''s story and approves it again',
  (select body = 'parent fixed it' and status = 'approved' from posts where id = '00000000-0000-0000-0000-0000000007b1'));
select rls.check('parent: edits a kid''s journal entry',
  (select body from journal_entries where id = '00000000-0000-0000-0000-0000000007e1') = 'parent fixed it');

select rls.check('photo_may_be_public: anon can ask, guard functions cannot be called',
  has_function_privilege('anon', 'public.photo_may_be_public(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.messages_edit_guard()', 'execute')
  and not has_function_privilege('authenticated', 'public.comments_edit_guard()', 'execute'));

rollback;
