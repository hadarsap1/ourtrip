-- Edit text after it is published (Hadar 30/10/2026).
--
-- Who may edit: the writer, and parents (any text). Parents already could
-- (owner_all on every table here); this adds the writers who could not.
--
--   messages  kids and guests edit their own message's text
--   comments  guests edit their own comment's text
--   posts     kids edit their own story after it was approved
--   photos    (kids already edit their own caption - 00033/00052)
--   journal   (kids already edit their own entries - 00007; guests never see it)
--
-- A kid's edit goes back to a parent. Approval was given to the words the
-- parent read, so new words from a kid wait for approval again:
--   * a kid's approved wall message -> approved_at cleared, off the guests'
--     wall until a parent approves it again
--   * a kid's approved story -> back to 'pending'
--   * a kid's approved photo whose caption changed -> back to 'pending'
--     (shared_with_guests is kept: rule 3 needs approved AND shared, so the
--     photo is hidden from guests until a parent approves it again)
-- Guests' messages and comments go up without approval today (00008, 00045),
-- so their edits do too. Kids read comments directly (00050), not through a
-- parent, so a guest editing a comment has no approval to undo.
--
-- An edit by anyone but a parent changes the text and nothing else: who
-- wrote it, where it lives, its audience and its approval stay pinned.
--
-- Copies made through the bridge (00045) are separate rows a parent created
-- from the text as it was. Editing the original does not change the copy.
--
-- PUBLIC BLOG. post_photos_public_select returned a photo's public copy for
-- as long as its story was public, without asking whether the photo itself
-- still qualifies. A kid caption edit can now put a photo back to pending, so
-- the public page now asks too: approved, shared, open to every guest - the
-- same test as photoMayGoPublic (QA 27/10). Rule 3 holds in the database,
-- not only in the parent's device cleaning up public copies.

-- ============ MESSAGES ============

-- Own originals only: a bridge copy may carry the original sender's id, but
-- it is the parent's copy, not the writer's to change.
create policy messages_member_update_own on messages
  for update
  using (
    (public.is_kid_of(trip_id) or public.is_active_guest_of(trip_id))
    and sender_id = (select public.current_member_id())
    and channel = 'guests'
    and origin_message_id is null
    and origin_comment_id is null
  )
  with check (
    (public.is_kid_of(trip_id) or public.is_active_guest_of(trip_id))
    and sender_id = (select public.current_member_id())
  );

-- Runs after messages_approval_guard and messages_bridge_guard (triggers fire
-- in name order), so it has the last word on approval for a kid's edit.
create or replace function public.messages_edit_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare r member_role := public.current_member_role();
begin
  if r is distinct from 'owner' then
    new.trip_id := old.trip_id;
    new.sender_id := old.sender_id;
    new.channel := old.channel;
    new.created_at := old.created_at;
    new.reply_to := old.reply_to;
    if r = 'kid' and new.body is distinct from old.body then
      new.approved_at := null;
      new.approved_by := null;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.messages_edit_guard() from public, anon, authenticated;

drop trigger if exists messages_edit_guard on messages;
create trigger messages_edit_guard before update on messages
  for each row execute function public.messages_edit_guard();

-- ============ COMMENTS ============

create policy comments_guest_update_own on comments
  for update
  using (public.is_active_guest_of(trip_id) and author_id = (select public.current_member_id()))
  with check (public.is_active_guest_of(trip_id) and author_id = (select public.current_member_id()));

create or replace function public.comments_edit_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.current_member_role() is distinct from 'owner' then
    new.trip_id := old.trip_id;
    new.author_id := old.author_id;
    new.post_id := old.post_id;
    new.episode_id := old.episode_id;
    new.created_at := old.created_at;
    new.shown_to_kids_at := old.shown_to_kids_at;
    new.shown_by := old.shown_by;
  end if;
  return new;
end;
$$;
revoke execute on function public.comments_edit_guard() from public, anon, authenticated;

drop trigger if exists comments_edit_guard on comments;
create trigger comments_edit_guard before update on comments
  for each row execute function public.comments_edit_guard();

-- ============ POSTS (stories) ============

-- was: only while not approved
alter policy posts_kid_update on posts
  using (public.is_kid_of(trip_id) and author_id = public.current_member_id());

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
      -- a kid can move a story between draft and pending, nothing else;
      -- editing an approved story sends it back to a parent (00076), with
      -- the audience the parent published it to (probe 63: a kid cannot
      -- widen a published story)
      if old.status = 'approved' then
        new.status := 'pending';
        new.audience := old.audience;
      elsif new.status = 'approved' then
        new.status := old.status;
      end if;
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

-- ============ PHOTOS ============

create or replace function public.photos_guard_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.current_member_role() = 'kid' then
    -- new words on an approved photo wait for a parent again (00076)
    new.status := case
      when old.status = 'approved' and new.caption is distinct from old.caption then 'pending'
      else old.status
    end;
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
revoke execute on function public.photos_guard_update() from public, anon, authenticated;

-- ============ PUBLIC BLOG ============

-- Security definer: anon cannot read photos. Answers only yes/no about one id.
create or replace function public.photo_may_be_public(p_photo_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.photos ph
     where ph.id = p_photo_id
       and ph.status = 'approved'
       and ph.shared_with_guests
       and ph.audience = '{}'
  );
$$;
revoke execute on function public.photo_may_be_public(uuid) from public;
grant execute on function public.photo_may_be_public(uuid) to anon, authenticated;

alter policy post_photos_public_select on post_photos
  using (
    public_path is not null
    and exists (select 1 from posts p where p.id = post_photos.post_id and p.visibility = 'public')
    and public.photo_may_be_public(photo_id)
  );
