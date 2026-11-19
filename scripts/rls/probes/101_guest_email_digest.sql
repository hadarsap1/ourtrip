-- 00101: the guests' daily email. An active guest adds, reads and removes their
-- own opt-in row only; nobody else reads it (not even a parent); the token and
-- the last-sent time are the database's; the email's link stops it without
-- signing in, by token only.
begin;
\i scripts/rls/seed.sql

-- guest turns it on
set local role authenticated; select rls.as_guest();
insert into guest_email_optins (member_id, trip_id)
values ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a1');
select rls.check('guest: turns the daily email on and sees their row',
  (select count(*) from guest_email_optins) = 1);
reset role;
select rls.check('the token and the clock are filled by the database',
  (select unsubscribe_token is not null and last_sent_at <= now() from guest_email_optins
    where member_id = '00000000-0000-0000-0000-0000000000b3'));

do $$ begin
  set local role authenticated; perform rls.as_guest();
  update guest_email_optins set last_sent_at = now() + interval '1 year';
  raise notice 'FAIL  guest: changed the last-sent time';
exception when insufficient_privilege then raise notice 'PASS  guest: cannot change their row (no update)';
end $$;
reset role;

do $$ begin
  set local role authenticated; perform rls.as_guest();
  insert into guest_email_optins (member_id, trip_id, unsubscribe_token)
  values ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a1', gen_random_uuid());
  raise notice 'FAIL  guest: chose their own token';
exception when insufficient_privilege then raise notice 'PASS  guest: cannot choose the token';
end $$;
reset role;

do $$ begin
  set local role authenticated; perform rls.as_guest();
  insert into guest_email_optins (member_id, trip_id)
  values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1');
  raise notice 'FAIL  guest: signed a parent up';
exception when insufficient_privilege then raise notice 'PASS  guest: cannot sign anyone else up';
end $$;
reset role;

do $$ begin
  set local role authenticated; perform rls.as_revoked();
  insert into guest_email_optins (member_id, trip_id)
  values ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000a1');
  raise notice 'FAIL  revoked guest: turned the email on';
exception when insufficient_privilege then raise notice 'PASS  revoked guest: cannot turn the email on';
end $$;
reset role;

-- nobody else sees it
set local role authenticated; select rls.as_owner();
select rls.check('owner: does not read guests'' opt-ins (or their tokens)',
  (select count(*) from guest_email_optins) = 0);
reset role;
set local role authenticated; select rls.as_kid();
select rls.check('kid: does not read opt-ins', (select count(*) from guest_email_optins) = 0);
reset role;
do $$ begin
  set local role anon; perform rls.as_anon();
  perform count(*) from guest_email_optins;
  raise notice 'FAIL  anon: read opt-ins';
exception when insufficient_privilege then raise notice 'PASS  anon: cannot read opt-ins';
end $$;
reset role;

-- the email's link: anon, by token only
set local role anon; select rls.as_anon();
select rls.check('unsubscribe: a wrong token stops nothing',
  public.unsubscribe_guest_email(gen_random_uuid()) = false);
reset role;
create temp table probe_tok as
  select unsubscribe_token as t from guest_email_optins where member_id = '00000000-0000-0000-0000-0000000000b3';
grant select on probe_tok to anon;
set local role anon; select rls.as_anon();
select rls.check('unsubscribe: the right token stops it, without signing in',
  public.unsubscribe_guest_email((select t from probe_tok)) = true);
reset role;
select rls.check('unsubscribe: the row is gone',
  not exists (select 1 from guest_email_optins where member_id = '00000000-0000-0000-0000-0000000000b3'));

-- turn on again, then off from the app
set local role authenticated; select rls.as_guest();
insert into guest_email_optins (member_id, trip_id)
values ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a1');
delete from guest_email_optins where member_id = '00000000-0000-0000-0000-0000000000b3';
reset role;
select rls.check('guest: turns it off from the app',
  not exists (select 1 from guest_email_optins where member_id = '00000000-0000-0000-0000-0000000000b3'));

rollback;
