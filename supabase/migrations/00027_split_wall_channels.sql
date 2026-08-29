-- Split the family wall into two feeds (security review finding M5).
--
-- WHAT WAS TRUE. `messages_guest_select` gave an active guest the ENTIRE feed
-- with no filter, and `messages_guest_insert` let them write into it. That
-- matched DECISIONS #15 ("one shared feed, no private threads in v1"), so it
-- was a decision rather than a defect — but it was the single place in the
-- whole app where something reaches a guest, or reaches the kids from a
-- guest, without a parent approving it first. Photos and journal entries both
-- require an explicit owner action; the wall did not. Owners chose to split.
--
-- THE MODEL. One column, two audiences:
--
--   channel = 'family'  → owners + kids.   Guests cannot read or write.
--   channel = 'guests'  → owners + guests. Kids cannot read or write.
--
-- Parents are in both and are the bridge between them. A guest can no longer
-- read what the kids write, and can no longer write anything a kid will see.
--
-- Kids are deliberately kept out of the guest channel entirely rather than
-- given read-only access: "the aunt can talk to the parents" is the intent,
-- and a feed a child can read is a feed a child can be addressed in.
--
-- Safe to apply: `messages` holds 0 rows, so the `default 'family'` backfills
-- nothing. Were it non-empty, existing guest-written messages would want
-- reclassifying by sender role before this ran.
--
-- DECISIONS #15 is superseded by this migration. Update it there too.

create type message_channel as enum ('family', 'guests');

alter table messages
  add column channel message_channel not null default 'family';

comment on column messages.channel is
  'Which feed this message belongs to. family = owners + kids; guests = '
  'owners + guests. Enforced by the policies below, not by the client. '
  'See migration 00027 (review finding M5).';

create index idx_messages_trip_channel on messages(trip_id, channel, created_at);

-- ============ KIDS: family channel only ============

drop policy messages_kid_select on messages;
create policy messages_kid_select on messages
  for select using (
    public.is_kid_of(trip_id) and channel = 'family'
  );

drop policy messages_kid_insert on messages;
create policy messages_kid_insert on messages
  for insert with check (
    public.is_kid_of(trip_id)
    and sender_id = public.current_member_id()
    and channel = 'family'
  );

-- ============ GUESTS: guest channel only ============

drop policy messages_guest_select on messages;
create policy messages_guest_select on messages
  for select using (
    public.is_active_guest_of(trip_id) and channel = 'guests'
  );

drop policy messages_guest_insert on messages;
create policy messages_guest_insert on messages
  for insert with check (
    public.is_active_guest_of(trip_id)
    and sender_id = public.current_member_id()
    and channel = 'guests'
  );

-- Owners keep messages_owner_all (00001) and so see and post to both.
--
-- Note there is no UPDATE policy for kids or guests on `messages` — there
-- never was — so neither can move an existing message between channels.
-- Deny-by-default covers what would otherwise need a guard trigger.
