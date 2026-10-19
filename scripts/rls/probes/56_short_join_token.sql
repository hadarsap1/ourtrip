-- 00056: the join token is short (8 chars, lowercase, no look-alikes), a
-- reset draws a new short one, and the old token stops working.
begin;
\i scripts/rls/seed.sql

set local role authenticated; select rls.as_owner();
create temp table tok as select public.guest_join_token('00000000-0000-0000-0000-0000000000a1') as t;
select rls.check('owner: the token is 8 chars of the short alphabet',
  (select t ~ '^[0-9abcdefghjkmnpqrstvwxyz]{8}$' from tok));
create temp table tok2 as select public.guest_join_token('00000000-0000-0000-0000-0000000000a1', true) as t;
select rls.check('owner: a reset gives a different short token',
  (select t ~ '^[0-9abcdefghjkmnpqrstvwxyz]{8}$' from tok2) and (select t from tok2) <> (select t from tok));
grant select on tok, tok2 to anon;
reset role;

set local role anon; select rls.as_anon();
select rls.check('anon: the old token is no longer valid', (public.guest_join_info((select t from tok)))->>'valid' = 'false');
select rls.check('anon: the new token is valid', (public.guest_join_info((select t from tok2)))->>'valid' = 'true');
reset role;
select rls.check('anon cannot call guest_join_new_token',
  not has_function_privilege('anon', 'public.guest_join_new_token()', 'execute'));

-- 2000 draws: all short, and no repeats (40 bits; a repeat here means a bug)
select rls.check('2000 tokens, all well-formed and distinct',
  (select count(distinct x) = 2000 and bool_and(x ~ '^[0-9abcdefghjkmnpqrstvwxyz]{8}$')
     from (select public.guest_join_new_token() as x from generate_series(1, 2000)) s));

rollback;
