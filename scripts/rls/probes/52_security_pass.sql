-- 00052: a kid cannot swap a photo's file; the cron secret lives in the DB.
begin;
\i scripts/rls/seed.sql

-- a kid's photo, approved and shared by a parent
insert into photos (id, trip_id, uploaded_by, file_path, status, shared_with_guests, caption) values
  ('00000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'k/mine.jpg', 'approved', true, 'old');
set local role authenticated; select rls.as_kid();
update photos set file_path = 'p/unshared.jpg', caption = 'new' where id = '00000000-0000-0000-0000-0000000000c9';
reset role;
select rls.check('kid: cannot repoint an approved photo at another file',
  (select file_path = 'k/mine.jpg' and caption = 'new' from photos where id = '00000000-0000-0000-0000-0000000000c9'));
set local role authenticated; select rls.as_kid();
update photos set uploaded_by = '00000000-0000-0000-0000-0000000000b1' where id = '00000000-0000-0000-0000-0000000000c9';
reset role;
select rls.check('kid: cannot hand the photo to someone else',
  (select uploaded_by = '00000000-0000-0000-0000-0000000000b2' from photos where id = '00000000-0000-0000-0000-0000000000c9'));

-- cron secret
select rls.check('a cron secret exists, 64 characters', (select length(value) = 64 from private.app_secrets where name = 'cron_secret'));
select rls.check('the jobs send it', (select public.cron_secret_header()->>'x-cron-secret') = (select value from private.app_secrets where name = 'cron_secret'));
select rls.check('matches: right secret yes, wrong / empty no',
  public.cron_secret_matches((select value from private.app_secrets where name = 'cron_secret'))
  and not public.cron_secret_matches('wrong') and not public.cron_secret_matches('') and not public.cron_secret_matches(null));
select rls.check('no API role can read the secret or call the helpers',
  not has_table_privilege('anon', 'private.app_secrets', 'select')
  and not has_table_privilege('authenticated', 'private.app_secrets', 'select')
  and not has_function_privilege('anon', 'public.cron_secret_matches(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.cron_secret_matches(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.cron_secret_header()', 'execute')
  and has_function_privilege('service_role', 'public.cron_secret_matches(text)', 'execute'));

rollback;
