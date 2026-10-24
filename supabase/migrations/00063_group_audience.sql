-- Group audiences (Hadar 22/10/2026, DECISIONS #39): a message on the wall, a
-- story or a photo can go to everyone or only to chosen guest groups
-- (guests_allowlist.labels, 00061) - "כיתה עומר" gets a message the rest of
-- the guests never see.
--
--   audience = '{}'          everyone who could see it before (unchanged)
--   audience = '{כיתה עומר}' only guests in that group, plus the family below
--
-- WHO SEES GROUP CONTENT
--   guest  - only if one of their groups is in the audience. A guest with no
--            group sees only the '{}' content.
--   owner  - everything, as before.
--   kid    - the groups linked to them (guest_group_kids: "כיתה עומר" is
--            Omer's), plus what they wrote themself. Ella does not see Omer's
--            class, and the other way round.
--
-- WHO SETS IT
--   wall    - the writer. A guest writes only to groups they are in (so a
--             class's replies stay in the class); a kid only to the groups
--             linked to them. A kid's message still waits for a parent
--             (00049), who can change the audience before approving.
--   stories - the parent who publishes. A kid's story arrives with '{}' and
--             visibility 'family' (posts_guard), as before.
--   photos  - the parent. Narrows DECISIONS #5, never widens it: a guest sees
--             a photo only if it is approved AND shared_with_guests AND in an
--             audience they belong to. Kids still see every family photo -
--             photos are the family's own; the audience only filters guests.
--
-- Comments, reactions and a story's photos already check the caller's own
-- access to the story / photo (post_photos_select, comments_*_select,
-- feedback_target_visible are invoker), and guest-photos / guest-media read
-- through the caller's JWT, so narrowing posts and photos narrows all of them.

-- ============ the kid behind a group ============

create table guest_group_kids (
  trip_id uuid not null references trips(id),
  label text not null check (char_length(label) between 1 and 40),
  member_id uuid not null references members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (trip_id, label)
);

comment on table guest_group_kids is
  'Links a guest group to the kid it belongs to ("כיתה עומר" → Omer): that kid '
  'sees the group''s wall and stories (00063).';

create index idx_guest_group_kids_member_id on guest_group_kids(member_id);

-- only a kid of the same trip can own a group
create or replace function public.guest_group_kids_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from members m
     where m.id = new.member_id and m.trip_id = new.trip_id and m.role = 'kid'
  ) then
    raise exception 'a group can only be linked to a kid of the same trip'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.guest_group_kids_guard() from public, anon, authenticated;

create trigger guest_group_kids_guard
  before insert or update on guest_group_kids
  for each row execute function public.guest_group_kids_guard();

alter table guest_group_kids enable row level security;

create policy guest_group_kids_owner_all on guest_group_kids
  using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));

-- a kid sees which groups are theirs (the wall shows them as tabs)
create policy guest_group_kids_kid_select on guest_group_kids for select
  using (
    trip_id = (select public.member_trip_as('kid'))
    and member_id = (select public.current_member_id())
  );

-- ============ the caller's groups ============

-- An active guest's groups; '{}' for anyone else. Policies call it wrapped in
-- (select ...) so it runs once per query (00059).
create or replace function public.my_guest_labels()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce((
    select g.labels
      from members m
      join guests_allowlist g
        on g.trip_id = m.trip_id and lower(g.email) = lower(m.email)
     where m.id = public.current_member_id()
       and m.role = 'guest'
       and g.revoked_at is null
     limit 1
  ), '{}');
$$;

-- The groups linked to the calling kid; '{}' for anyone else.
create or replace function public.my_kid_labels()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(k.label), '{}')
    from guest_group_kids k
    join members m on m.id = k.member_id and m.trip_id = k.trip_id
   where m.id = public.current_member_id()
     and m.role = 'kid';
$$;

-- anon too: the owners' FOR ALL policies apply to every role (see 00059)
revoke execute on function public.my_guest_labels() from public;
revoke execute on function public.my_kid_labels() from public;
grant execute on function public.my_guest_labels() to anon, authenticated;
grant execute on function public.my_kid_labels() to anon, authenticated;

-- ============ the wall ============

alter table messages
  add column audience text[] not null default '{}'
    check (public.guest_labels_valid(audience));

comment on column messages.audience is
  '''{}'' = everyone on the wall; otherwise only guests in one of these groups, '
  'the parents, the sender and the kid each group is linked to (00063).';

create index idx_messages_audience on messages using gin (audience);

alter policy messages_guest_select on messages
  using (
    trip_id = (select public.active_guest_trip())
    and channel = 'guests'
    and approved_at is not null
    and (audience = '{}' or audience && (select public.my_guest_labels()))
  );

alter policy messages_guest_insert on messages
  with check (
    public.is_active_guest_of(trip_id)
    and sender_id = public.current_member_id()
    and channel = 'guests'
    and audience <@ public.my_guest_labels()
  );

alter policy messages_kid_select on messages
  using (
    trip_id = (select public.member_trip_as('kid'))
    and channel = 'guests'
    and (approved_at is not null or sender_id = (select public.current_member_id()))
    and (
      audience = '{}'
      or sender_id = (select public.current_member_id())
      or audience && (select public.my_kid_labels())
    )
  );

alter policy messages_kid_insert on messages
  with check (
    public.is_kid_of(trip_id)
    and sender_id = public.current_member_id()
    and channel = 'guests'
    and audience <@ public.my_kid_labels()
  );

-- Only a parent changes who a message goes to once it exists. No other role
-- has an UPDATE policy on messages today; this holds if one is ever added.
create or replace function public.messages_approval_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare r member_role := public.current_member_role();
begin
  if tg_op = 'INSERT' then
    new.approved_by := null;
    new.approved_at := case when r = 'kid' then null else now() end;
  elsif r is distinct from 'owner' then
    new.approved_at := old.approved_at;
    new.approved_by := old.approved_by;
    new.audience := old.audience;
  elsif old.approved_at is null and new.approved_at is not null then
    new.approved_at := now();
    new.approved_by := public.current_member_id();
  end if;
  return new;
end;
$$;

-- ============ stories ============

alter table posts
  add column audience text[] not null default '{}'
    check (public.guest_labels_valid(audience)),
  -- groups are guests; a family or public story has no group audience
  add constraint posts_audience_guests_only check (audience = '{}' or visibility = 'guests');

comment on column posts.audience is
  'For visibility ''guests'': ''{}'' = every guest; otherwise only guests in one '
  'of these groups, the parents, the author and the linked kids (00063).';

alter policy posts_guest_select on posts
  using (
    trip_id = (select public.active_guest_trip())
    and status = 'approved'
    and visibility in ('guests', 'public')
    and (publish_after is null or publish_after <= now())
    and (audience = '{}' or audience && (select public.my_guest_labels()))
  );

alter policy posts_kid_select on posts
  using (
    trip_id = (select public.member_trip_as('kid'))
    and (status = 'approved' or author_id = (select public.current_member_id()))
    and (
      audience = '{}'
      or author_id = (select public.current_member_id())
      or audience && (select public.my_kid_labels())
    )
  );

-- posts_guard (00043) plus: a kid never sets a story's audience
create or replace function public.posts_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  author_role member_role;
  caller_role member_role := public.current_member_role();
begin
  select role into author_role from members where id = new.author_id;

  if caller_role = 'kid' then
    if tg_op = 'INSERT' then
      -- a kid may only start a draft or send one straight for approval
      if new.status = 'approved' then new.status := 'pending'; end if;
      new.visibility := 'family';
      new.audience := '{}';
      new.publish_after := null;
    else
      -- a kid can move a story between draft and pending, nothing else
      if new.status = 'approved' then new.status := old.status; end if;
      new.visibility := old.visibility;
      new.audience := old.audience;
      new.publish_after := old.publish_after;
      new.author_id := old.author_id;
      new.trip_id := old.trip_id;
    end if;
    new.approved_by := case when tg_op = 'INSERT' then null else old.approved_by end;
    new.published_at := case when tg_op = 'INSERT' then null else old.published_at end;
    new.public_slug := case when tg_op = 'INSERT' then null else old.public_slug end;
  end if;

  -- DESIGN-sharing §1: a story a kid wrote is never public, whoever asks
  if new.visibility = 'public' and author_role is distinct from 'owner' then
    raise exception 'only a parent''s own story can be public'
      using errcode = '42501';
  end if;

  if new.status = 'approved' then
    new.published_at := coalesce(new.published_at, now());
    if new.approved_by is null and caller_role = 'owner' then
      new.approved_by := public.current_member_id();
    end if;
  else
    new.published_at := null;
  end if;

  if new.visibility = 'public' and new.public_slug is null then
    new.public_slug := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  end if;

  return new;
end;
$$;

-- ============ photos ============

alter table photos
  add column audience text[] not null default '{}'
    check (public.guest_labels_valid(audience));

comment on column photos.audience is
  'Narrows DECISIONS #5 for guests: approved AND shared_with_guests AND (''{}'' '
  'or one of the guest''s groups). Kids and parents see every photo (00063).';

alter policy photos_guest_select on photos
  using (
    public.is_active_guest_of(trip_id)
    and status = 'approved'
    and shared_with_guests = true
    and (audience = '{}' or audience && (select public.my_guest_labels()))
  );

-- the audience is a parent's choice, like approval and sharing
create or replace function public.photos_enforce_kid_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare uploader_role member_role;
begin
  select role into uploader_role from members where id = new.uploaded_by;
  if uploader_role = 'kid' then
    new.status := 'pending';
    new.shared_with_guests := false;
    new.approved_by := null;
    new.audience := '{}';
  end if;
  return new;
end;
$$;

create or replace function public.photos_guard_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.current_member_role() = 'kid' then
    new.status := old.status;
    new.shared_with_guests := old.shared_with_guests;
    new.approved_by := old.approved_by;
    new.audience := old.audience;
    -- the file and its ownership are not the kid's to change (00052)
    new.file_path := old.file_path;
    new.trip_id := old.trip_id;
    new.uploaded_by := old.uploaded_by;
  end if;
  return new;
end;
$$;
