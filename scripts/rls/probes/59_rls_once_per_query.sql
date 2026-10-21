-- 00059: the hot read policies were rewritten to evaluate once per query.
-- Equivalence check: for every identity and every rewritten table, the rows
-- visible under the new policies must be exactly the rows the pre-00059
-- predicates (the per-row helper functions) allowed.
begin;
\i scripts/rls/seed.sql

-- a second trip, so a leak across trips would show
insert into trips (id, name) values ('00000000-0000-0000-0000-0000000000a2', 'other');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000aa12', 'owner2@probe.test');
insert into members (id, trip_id, auth_user_id, email, display_name, role) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000aa12', 'owner2@probe.test', 'Owner2', 'owner');

-- stories: family-only, guests, public (+ a public one on the other trip), a kid draft
select rls.as_owner();
insert into posts (id, trip_id, author_id, title, status, visibility) values
  ('00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'family', 'approved', 'family'),
  ('00000000-0000-0000-0000-0000000005d2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'guests', 'approved', 'guests'),
  ('00000000-0000-0000-0000-0000000005d3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'public', 'approved', 'public'),
  ('00000000-0000-0000-0000-0000000005d4', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'draft', 'draft', 'guests');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000aa12","email":"owner2@probe.test","role":"authenticated"}', true);
insert into posts (id, trip_id, author_id, title, status, visibility) values
  ('00000000-0000-0000-0000-0000000005e1', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000e1', 'other public', 'approved', 'public'),
  ('00000000-0000-0000-0000-0000000005e2', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000e1', 'other guests', 'approved', 'guests');
select rls.as_kid();
insert into posts (id, trip_id, author_id, title, status, visibility) values
  ('00000000-0000-0000-0000-0000000005d5', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'kid draft', 'pending', 'family');

-- episodes: approved+shared, approved only, pending; one on the other trip
select rls.as_owner();
insert into episodes (id, trip_id, recorded_by, title, file_path, status, shared_with_guests) values
  ('00000000-0000-0000-0000-0000000005f1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'shared', 'a/1', 'approved', true),
  ('00000000-0000-0000-0000-0000000005f2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'family', 'a/2', 'approved', false),
  ('00000000-0000-0000-0000-0000000005f3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'pending', 'a/3', 'pending', false),
  ('00000000-0000-0000-0000-0000000005f4', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000e1', 'other', 'a/4', 'approved', true);

-- wall: approved from owner and guest, a kid's pending one, the retired family
-- channel, and the other trip's wall
insert into messages (id, trip_id, sender_id, body, channel) values
  ('00000000-0000-0000-0000-000000000591', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'owner', 'guests'),
  ('00000000-0000-0000-0000-000000000592', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'family channel', 'family'),
  ('00000000-0000-0000-0000-000000000593', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', 'guest', 'guests'),
  ('00000000-0000-0000-0000-000000000594', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000e1', 'other trip', 'guests');
select rls.as_kid();
insert into messages (id, trip_id, sender_id, body, channel) values
  ('00000000-0000-0000-0000-000000000595', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'kid pending', 'guests');

-- a like and a comment on every target
insert into reactions (trip_id, member_id, post_id, episode_id, kind)
select coalesce(p.trip_id, e.trip_id), '00000000-0000-0000-0000-0000000000b1', p.id, e.id, 'heart'
  from (select id, trip_id from posts union all select null, null) p
  full join (select id, trip_id from episodes) e on false
 where (p.id is null) <> (e.id is null);
insert into comments (trip_id, author_id, post_id, episode_id, body)
select coalesce(p.trip_id, e.trip_id), '00000000-0000-0000-0000-0000000000b1', p.id, e.id, 'c'
  from (select id, trip_id from posts union all select null, null) p
  full join (select id, trip_id from episodes) e on false
 where (p.id is null) <> (e.id is null);

-- the pre-00059 predicates, verbatim in meaning, evaluated with RLS bypassed
create function pg_temp.old_visible(t text) returns setof uuid language plpgsql as $$
begin
  if t = 'messages' then return query
    select id from messages where
      is_owner_of(trip_id)
      or (is_kid_of(trip_id) and channel = 'guests' and (approved_at is not null or sender_id = current_member_id()))
      or (is_active_guest_of(trip_id) and channel = 'guests' and approved_at is not null);
  elsif t = 'posts' then return query
    select id from posts where
      is_owner_of(trip_id)
      or (is_kid_of(trip_id) and (status = 'approved' or author_id = current_member_id()))
      or (is_active_guest_of(trip_id) and status = 'approved' and visibility in ('guests', 'public') and (publish_after is null or publish_after <= now()))
      or (visibility = 'public' and status = 'approved' and (publish_after is null or publish_after <= now()));
  elsif t = 'episodes' then return query
    select id from episodes where
      is_owner_of(trip_id)
      or (is_kid_of(trip_id) and status = 'approved')
      or (is_active_guest_of(trip_id) and status = 'approved' and shared_with_guests = true);
  end if;
end $$;

-- targets visible to the caller, for reactions/comments (feedback_target_visible
-- ran under the caller's own RLS, so it is computed from the caller's view)
create temp table seen (tbl text, id uuid);
grant all on seen to authenticated, anon;

create function pg_temp.compare(who text) returns void language plpgsql as $$
declare t text; missing int; extra int;
begin
  foreach t in array array['messages', 'posts', 'episodes'] loop
    select count(*) into missing from pg_temp.old_visible(t) o where o not in (select id from seen where tbl = t);
    select count(*) into extra from seen s where s.tbl = t and s.id not in (select * from pg_temp.old_visible(t));
    perform rls.check(format('%s: %s visible exactly as before 00059', who, t), missing = 0 and extra = 0);
  end loop;
  -- feedback: owner rule, or (kid or guest) and the target is one the caller can see
  select count(*) into missing from (
    select r.id from reactions r where is_owner_of(r.trip_id)
      or ((is_kid_of(r.trip_id) or is_active_guest_of(r.trip_id))
          and (r.post_id in (select id from seen where tbl = 'posts') or r.episode_id in (select id from seen where tbl = 'episodes')))
    except select id from seen where tbl = 'reactions') x;
  select count(*) into extra from (
    select id from seen where tbl = 'reactions'
    except select r.id from reactions r where is_owner_of(r.trip_id)
      or ((is_kid_of(r.trip_id) or is_active_guest_of(r.trip_id))
          and (r.post_id in (select id from seen where tbl = 'posts') or r.episode_id in (select id from seen where tbl = 'episodes')))) x;
  perform rls.check(format('%s: reactions visible exactly as before 00059', who), missing = 0 and extra = 0);
  select count(*) into missing from (
    select c.id from comments c where is_owner_of(c.trip_id)
      or ((is_kid_of(c.trip_id) or is_active_guest_of(c.trip_id))
          and (c.post_id in (select id from seen where tbl = 'posts') or c.episode_id in (select id from seen where tbl = 'episodes')))
    except select id from seen where tbl = 'comments') x;
  select count(*) into extra from (
    select id from seen where tbl = 'comments'
    except select c.id from comments c where is_owner_of(c.trip_id)
      or ((is_kid_of(c.trip_id) or is_active_guest_of(c.trip_id))
          and (c.post_id in (select id from seen where tbl = 'posts') or c.episode_id in (select id from seen where tbl = 'episodes')))) x;
  perform rls.check(format('%s: comments visible exactly as before 00059', who), missing = 0 and extra = 0);
end $$;

create function pg_temp.look() returns void language sql as $$
  insert into seen select 'messages', id from messages;
  insert into seen select 'posts', id from posts;
  insert into seen select 'episodes', id from episodes;
  insert into seen select 'reactions', id from reactions;
  insert into seen select 'comments', id from comments;
$$;
grant execute on function pg_temp.look() to authenticated, anon;

-- owner
select rls.as_owner(); set local role authenticated; select pg_temp.look(); reset role;
select pg_temp.compare('owner'); delete from seen;
-- kid
select rls.as_kid(); set local role authenticated; select pg_temp.look(); reset role;
select pg_temp.compare('kid'); delete from seen;
-- guest
select rls.as_guest(); set local role authenticated; select pg_temp.look(); reset role;
select pg_temp.compare('guest'); delete from seen;
-- revoked guest
select rls.as_revoked(); set local role authenticated; select pg_temp.look(); reset role;
select pg_temp.compare('revoked guest'); delete from seen;
-- signed in, not a member
select rls.as_outsider(); set local role authenticated; select pg_temp.look(); reset role;
select pg_temp.compare('outsider'); delete from seen;
-- anon (public stories only)
select rls.as_anon(); set local role anon; select pg_temp.look(); reset role;
select pg_temp.compare('anon'); delete from seen;

-- spot checks that the scenario really exercises the rules
select rls.as_guest(); set local role authenticated;
select rls.check('guest: the wall shows approved guests-channel messages of this trip only',
  (select array_agg(body order by body) from messages) = array['guest', 'owner']);
select rls.check('guest: likes only on the guests/public stories and the shared episode',
  (select count(*) from reactions) = 3);
reset role;
select rls.as_kid(); set local role authenticated;
select rls.check('kid: sees own pending message', exists (select 1 from messages where body = 'kid pending'));
delete from messages where body = 'kid pending';
select rls.check('kid: can take back own pending message', not exists (select 1 from messages where body = 'kid pending'));
delete from messages where body = 'owner';
reset role;
select rls.check('kid: cannot delete an approved message', exists (select 1 from messages where body = 'owner'));

rollback;
