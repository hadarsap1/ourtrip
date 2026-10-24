-- "Whose parent is this?" (Hadar 23/10/2026). Most class guests are a parent
-- who joined with their own address - the kid has none - and on the wall
-- "דנה כהן" says less than "דנה כהן · של יואב". A guest carries up to three
-- kids' names (twins, or a kid in each class), shown as a small tag next to
-- their name wherever names appear.
--
--   members.kid_names              the tag. Display only: no policy reads it,
--                                  it changes nothing about who sees what.
--   guest_join_requests.kid_names  asked for on the join form; copied onto
--                                  the guest's members row when a parent
--                                  approves (the trigger below), so
--                                  guest-invite needs no change.
--   set_my_kid_names()             a guest edits their own tag. Security
--                                  definer and limited to that one column:
--                                  guests still have no UPDATE on members,
--                                  so name and role stay out of their reach.
--   trip_member_names()            returns the tag with the name (00051).
--
-- Parents edit any guest's tag through members_owner_all, as before.

create function public.kid_names_valid(p_names text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(p_names) <= 3
     and coalesce(bool_and(n is not null and char_length(n) between 1 and 40), true)
  from unnest(p_names) as n
$$;

-- trimmed, at most 40 characters each, no blanks or repeats, the first three
create function public.normalize_kid_names(p_names text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(n order by first_at), '{}')
    from (
      select n, min(i) as first_at
        from unnest(coalesce(p_names, '{}')) with ordinality as u(raw, i),
             lateral (select left(btrim(raw), 40) as n) t
       where n is not null and n <> ''
       group by n
       order by min(i)
       limit 3
    ) kept
$$;

alter table members
  add column kid_names text[] not null default '{}'
    check (public.kid_names_valid(kid_names));

alter table guest_join_requests
  add column kid_names text[] not null default '{}'
    check (public.kid_names_valid(kid_names));

comment on column members.kid_names is
  'The kids a guest is the parent of (up to 3), shown as a tag by their name. '
  'Display only: no policy reads it.';
comment on column guest_join_requests.kid_names is
  'Kids'' names typed on the join form; copied to members.kid_names on approval.';

-- ============ NAMES FOR EVERYONE ON THE TRIP ============

-- Same rule as 00051; the return type grows, so drop and create.
drop function public.trip_member_names(uuid);

create function public.trip_member_names(p_trip_id uuid)
returns table (id uuid, trip_id uuid, display_name text, role member_role, created_at timestamptz, kid_names text[])
language sql stable security definer set search_path = public as $$
  select m.id, m.trip_id, m.display_name, m.role, m.created_at, m.kid_names
    from members m
   where m.trip_id = p_trip_id
     and (public.is_owner_of(p_trip_id) or public.is_kid_of(p_trip_id) or public.is_active_guest_of(p_trip_id))
   order by m.display_name;
$$;

revoke execute on function public.trip_member_names(uuid) from public, anon;
grant execute on function public.trip_member_names(uuid) to authenticated;

-- ============ A GUEST EDITS THEIR OWN TAG ============

create function public.set_my_kid_names(p_trip_id uuid, p_kid_names text[])
returns text[]
language plpgsql security definer set search_path = public as $$
declare v_names text[] := public.normalize_kid_names(p_kid_names);
begin
  if not public.is_active_guest_of(p_trip_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update members
     set kid_names = v_names
   where trip_id = p_trip_id and auth_user_id = auth.uid() and role = 'guest';
  return v_names;
end;
$$;

revoke execute on function public.set_my_kid_names(uuid, text[]) from public, anon;
grant execute on function public.set_my_kid_names(uuid, text[]) to authenticated;

-- ============ THE JOIN FORM ASKS FOR IT ============

-- 00054's body with one more argument. The old three-argument function is
-- dropped so a call with named arguments is never ambiguous; an older client
-- still calls it with three and gets the default.
drop function public.submit_guest_join(text, text, text);

create function public.submit_guest_join(
  p_token text, p_name text, p_email text default null, p_kid_names text[] default '{}'
)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_trip uuid;
  v_name text := left(btrim(coalesce(p_name, '')), 60);
  v_jwt_email text := case when auth.uid() is not null then lower(nullif(auth.jwt()->>'email', '')) end;
  v_email text := coalesce(v_jwt_email, lower(btrim(coalesce(p_email, ''))));
  v_kids text[] := public.normalize_kid_names(p_kid_names);
begin
  select trip_id into v_trip from guest_join_links where token = p_token;
  if v_trip is null then
    return 'invalid';
  end if;
  if v_name = '' or length(v_email) > 254 or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    return 'bad_input';
  end if;

  if exists (
    select 1 from members m
     where m.trip_id = v_trip and lower(m.email) = v_email
       and (m.role <> 'guest' or exists (
             select 1 from guests_allowlist g
              where g.trip_id = v_trip and lower(g.email) = v_email and g.revoked_at is null))
  ) then
    return case when v_jwt_email is not null then 'member' else 'pending' end;
  end if;

  if (select count(*) from guest_join_requests
       where trip_id = v_trip and requested_at > now() - interval '1 hour') >= 30
     or (select count(*) from guest_join_requests
          where trip_id = v_trip and status = 'pending') >= 200 then
    return 'busy';
  end if;

  insert into guest_join_requests (trip_id, email, display_name, auth_user_id, kid_names)
  values (v_trip, v_email, v_name, case when v_jwt_email is not null then auth.uid() end, v_kids)
  on conflict (trip_id, email) do update
    set display_name = excluded.display_name,
        auth_user_id = coalesce(excluded.auth_user_id, guest_join_requests.auth_user_id),
        kid_names = excluded.kid_names,
        requested_at = now(),
        status = case when guest_join_requests.status = 'declined' then 'declined' else 'pending' end,
        decided_at = case when guest_join_requests.status = 'declined' then guest_join_requests.decided_at end,
        decided_by = case when guest_join_requests.status = 'declined' then guest_join_requests.decided_by end;

  return 'pending';
end;
$$;

revoke execute on function public.submit_guest_join(text, text, text, text[]) from public;
grant execute on function public.submit_guest_join(text, text, text, text[]) to anon, authenticated;

-- ============ APPROVAL CARRIES THE TAG OVER ============

-- guest-invite inserts the guest's members row; when it comes with no tag,
-- take the one from that person's join request. A row a parent already
-- tagged, or a re-invite of an existing guest, is left as it is.
create function public.members_kid_names_from_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'guest' and cardinality(new.kid_names) = 0 and new.email is not null then
    select r.kid_names into new.kid_names
      from guest_join_requests r
     where r.trip_id = new.trip_id and r.email = lower(new.email);
    new.kid_names := coalesce(new.kid_names, '{}');
  end if;
  return new;
end;
$$;

revoke execute on function public.members_kid_names_from_request() from public, anon, authenticated;

create trigger members_kid_names_from_request
  before insert on members
  for each row execute function public.members_kid_names_from_request();
