-- 00048: the journal is the family's own; guests read stories, not the journal.
begin;
\i scripts/rls/seed.sql

set local role authenticated; select rls.as_owner();
insert into journal_entries (id, trip_id, author_id, body) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'parent day');
select rls.check('owner: writes and reads the journal',
  (select count(*) from journal_entries where id = '00000000-0000-0000-0000-0000000000e1') = 1);
reset role;

set local role authenticated; select rls.as_kid();
insert into journal_entries (id, trip_id, author_id, body) values
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'kid day');
select rls.check('kid: writes and reads own entry',
  (select count(*) from journal_entries where id = '00000000-0000-0000-0000-0000000000e2') = 1);
reset role;

set local role authenticated; select rls.as_guest();
select rls.check('guest: reads no journal entry at all', (select count(*) from journal_entries) = 0);
select rls.check('guest: no journal policy left',
  not exists (select 1 from pg_policies where tablename = 'journal_entries' and policyname = 'journal_entries_guest_select'));
reset role;

set local role anon;
select rls.check('anon: reads no journal entry', (select count(*) from journal_entries) = 0);
reset role;

select rls.check('no share flag left on the journal',
  not exists (select 1 from information_schema.columns
               where table_name = 'journal_entries' and column_name = 'shared_with_guests'));

rollback;
