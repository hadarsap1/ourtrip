-- Group audiences, simplified (Hadar 22/10/2026, amends DECISIONS #39 / 00063).
-- "The group belongs to a kid" was confusing in the guests screen. The model
-- is now only:
--
--   * a guest is in one or more groups (guests_allowlist.labels, 00061)
--   * whoever writes or uploads chooses who sees it - everyone (default) or
--     one or more groups
--   * group content is seen, and answered, only by guests in those groups
--   * the whole family (parents AND kids) sees everything, as before 00063
--
-- So: the kids' read and write policies go back to what they were before
-- 00063 (guest_group_kids and my_kid_labels() stop being read; 00065 drops
-- them); a kid may choose any
-- group for a message or story (it still waits for a parent, who can change
-- it); guests stay limited to their own groups. Guest policies are unchanged.

-- ============ kids: the family sees everything ============

alter policy messages_kid_select on messages
  using (
    trip_id = (select public.member_trip_as('kid'))
    and channel = 'guests'
    and (approved_at is not null or sender_id = (select public.current_member_id()))
  );

alter policy messages_kid_insert on messages
  with check (
    public.is_kid_of(trip_id)
    and sender_id = public.current_member_id()
    and channel = 'guests'
  );

alter policy posts_kid_select on posts
  using (
    trip_id = (select public.member_trip_as('kid'))
    and (status = 'approved' or author_id = (select public.current_member_id()))
  );

-- ============ the groups a member can address ============

-- Parents and kids: every group on the trip's guest list. A guest: their own
-- groups (my_guest_labels). Anyone else: none. Names only - who is in a group
-- stays with the parents (guests_allowlist is owner-only).
create or replace function public.my_groups()
returns text[] language sql stable security definer set search_path = public as $$
  select case
    when public.current_member_role() in ('owner', 'kid') then (
      select coalesce(array_agg(distinct l order by l), '{}')
        from guests_allowlist g, unnest(g.labels) as l
       where g.trip_id = (
         select m.trip_id from members m where m.id = public.current_member_id()
       )
    )
    else public.my_guest_labels()
  end;
$$;
revoke execute on function public.my_groups() from public;
grant execute on function public.my_groups() to anon, authenticated;

-- ============ a kid's story carries the kid's choice to the parent ============

-- A kid's story stays 'family' until a parent publishes it, so its audience
-- is only a suggestion until then; only a public story can have none.
alter table posts drop constraint posts_audience_guests_only;
alter table posts
  add constraint posts_audience_not_public check (audience = '{}' or visibility <> 'public');

-- posts_guard (00063) minus "a kid never sets the audience": a kid may set it
-- while the story is theirs to edit (draft / pending - posts_kid_update).
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
      new.publish_after := null;
    else
      -- a kid can move a story between draft and pending, nothing else
      if new.status = 'approved' then new.status := old.status; end if;
      new.visibility := old.visibility;
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

-- ============ a kid's photo carries the kid's choice too ============

-- A kid's upload is still pending and unshared (#5); the audience it carries
-- only narrows what a parent's sharing later opens.
create or replace function public.photos_enforce_kid_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare uploader_role member_role;
begin
  select role into uploader_role from members where id = new.uploaded_by;
  if uploader_role = 'kid' then
    new.status := 'pending';
    new.shared_with_guests := false;
    new.approved_by := null;
  end if;
  return new;
end;
$$;

comment on column messages.audience is
  '''{}'' = everyone on the wall; otherwise only guests in one of these groups. '
  'The family (parents and kids) sees every message (00064).';
comment on column posts.audience is
  '''{}'' = every guest; otherwise only guests in one of these groups. A kid''s '
  'choice rides along until a parent publishes (00064).';
comment on column photos.audience is
  'Narrows DECISIONS #5 for guests: approved AND shared_with_guests AND (''{}'' '
  'or one of the guest''s groups). The family sees every photo (00064).';
