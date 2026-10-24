-- The kids' side of the app, reshaped (Hadar 14/10/2026, DECISIONS #33-#35).
--
-- 1. ONE WALL. The family feed goes: the family is together all day and the
--    kids have nothing to write to their parents in an app. What stays is the
--    wall with friends and family (channel 'guests'), and the kids join it -
--    but a kid's message goes out only after a parent approves it. Kids read
--    the approved messages on that wall, guests' included. This reverses the
--    "kids never read the guest feed" half of DECISIONS #18 by decision; the
--    other half - nothing from a kid reaches a guest without a parent - holds,
--    now through approval instead of the bridge.
--
--      messages.approved_at  null = waiting for a parent. Guests never see it;
--                            the kid who wrote it does. Stamped at insert for
--                            everyone but kids; only an owner can set it later.
--
-- 2. THE PODCAST IS RECORDED BY PARENTS. Kids listen to approved episodes and
--    read the listeners' comments on them, read-only. They no longer record,
--    edit or delete; the audio bucket takes uploads from owners only.
--
-- 3. DOCUMENTS ARE OWNER-ONLY AGAIN. "Share a document with the kids" (00014)
--    goes, column and policies with it (0 documents were shared).
--
-- Pocket money is only hidden in the UI (a flag), so nothing here.

-- ============ 1. THE WALL ============

alter table messages
  add column approved_at timestamptz,
  add column approved_by uuid references members(id);

comment on column messages.approved_at is
  'null = a kid''s message waiting for a parent; guests never see it. '
  'Stamped at insert for every other sender (migration 00049).';

-- everything already on the wall was visible, so it counts as approved
update messages set approved_at = created_at;

create index idx_messages_approved_by on messages(approved_by);
create index idx_messages_pending on messages(trip_id) where approved_at is null;

-- Rejecting a kid's message deletes it, and a parent who has seen it has a
-- read row pointing at it. Reads follow their message out.
alter table message_reads drop constraint message_reads_message_id_fkey;
alter table message_reads
  add constraint message_reads_message_id_fkey
  foreign key (message_id) references messages(id) on delete cascade;

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
  elsif old.approved_at is null and new.approved_at is not null then
    new.approved_at := now();
    new.approved_by := public.current_member_id();
  end if;
  return new;
end;
$$;

revoke execute on function public.messages_approval_guard() from public, anon, authenticated;

create trigger messages_approval_guard
  before insert or update on messages
  for each row execute function public.messages_approval_guard();

drop policy messages_kid_select on messages;
create policy messages_kid_select on messages
  for select using (
    public.is_kid_of(trip_id)
    and channel = 'guests'
    and (approved_at is not null or sender_id = public.current_member_id())
  );

drop policy messages_kid_insert on messages;
create policy messages_kid_insert on messages
  for insert with check (
    public.is_kid_of(trip_id)
    and sender_id = public.current_member_id()
    and channel = 'guests'
  );

-- a kid can take back a message that has not gone out yet
create policy messages_kid_delete_pending on messages
  for delete using (
    public.is_kid_of(trip_id)
    and sender_id = public.current_member_id()
    and approved_at is null
  );

drop policy messages_guest_select on messages;
create policy messages_guest_select on messages
  for select using (
    public.is_active_guest_of(trip_id)
    and channel = 'guests'
    and approved_at is not null
  );

-- A kid's message pings the parents when written and everyone else when a
-- parent approves it (push-send decides who, by approved_at).
create trigger messages_notify_approved
  after update of approved_at on messages
  for each row
  when (old.approved_at is null and new.approved_at is not null)
  execute function public.notify_wall_message();

-- ============ 2. THE PODCAST ============

drop policy episodes_kid_insert on episodes;
drop policy episodes_kid_update on episodes;
drop policy episodes_kid_delete on episodes;

drop policy episodes_kid_select on episodes;
create policy episodes_kid_select on episodes
  for select using (public.is_kid_of(trip_id) and status = 'approved');

drop policy audio_bucket_family_insert on storage.objects;
create policy audio_bucket_owner_insert on storage.objects
  for insert with check (
    bucket_id = 'audio' and public.current_member_role() = 'owner'
  );

-- listeners' comments on an episode the kid can hear, read-only (no kid
-- insert/update/delete policy on comments)
create policy comments_kid_select on comments
  for select using (
    public.is_kid_of(trip_id)
    and episode_id is not null
    and public.feedback_target_visible(trip_id, post_id, episode_id)
  );

-- ============ 3. DOCUMENTS ============

drop policy documents_kid_read on storage.objects;
drop policy documents_kid_select on documents;
drop function public.document_shared_with_current_kid(text);
drop index if exists idx_documents_shared_with_kids;
alter table documents drop column shared_with_kids;
