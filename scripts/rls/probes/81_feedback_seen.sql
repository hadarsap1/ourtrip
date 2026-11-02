-- 00081: each member marks what they have seen of the likes and comments.
-- Own rows only, for every role; nobody reads or writes another member's.
begin;
\i scripts/rls/seed.sql

set local role authenticated;
select rls.as_owner();
insert into feedback_seen (member_id, target_id) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1');
reset role;

set local role authenticated;
select rls.as_guest();
insert into feedback_seen (member_id, target_id) values
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000c1');
select rls.check('guest: marks a target seen and reads only their own row',
  (select count(*) from feedback_seen) = 1
  and (select member_id from feedback_seen) = '00000000-0000-0000-0000-0000000000b3');
update feedback_seen set seen_at = now() - interval '1 day'
  where member_id = '00000000-0000-0000-0000-0000000000b1';
delete from feedback_seen where member_id = '00000000-0000-0000-0000-0000000000b1';
do $$ begin
  insert into feedback_seen (member_id, target_id) values
    ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c2');
  raise exception 'FAIL  guest: wrote a seen mark for a parent';
exception when insufficient_privilege then null;
end $$;
select rls.check('guest: cannot write a seen mark for someone else', true);
do $$ begin
  update feedback_seen set member_id = '00000000-0000-0000-0000-0000000000b1';
  raise exception 'FAIL  guest: moved their seen mark to a parent';
exception when insufficient_privilege then null;
end $$;
select rls.check('guest: cannot move their mark to someone else', true);
reset role;
select rls.check('guest: could not change or delete the parent''s mark',
  exists (select 1 from feedback_seen
          where member_id = '00000000-0000-0000-0000-0000000000b1' and seen_at > now() - interval '1 hour'));

set local role authenticated;
select rls.as_kid();
insert into feedback_seen (member_id, target_id) values
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c1');
select rls.check('kid: marks a target seen and reads only their own row',
  (select count(*) from feedback_seen) = 1
  and (select member_id from feedback_seen) = '00000000-0000-0000-0000-0000000000b2');
reset role;

set local role authenticated;
select rls.as_owner();
select rls.check('parent: reads only their own marks, not the kid''s or the guest''s',
  (select count(*) from feedback_seen) = 1
  and (select member_id from feedback_seen) = '00000000-0000-0000-0000-0000000000b1');
reset role;

set local role authenticated;
select rls.as_outsider();
select rls.check('outsider: reads no marks', not exists (select 1 from feedback_seen));
reset role;

set local role anon;
select rls.as_anon();
select rls.check('anon: reads no marks', not exists (select 1 from feedback_seen));
reset role;

rollback;
