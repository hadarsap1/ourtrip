-- Replies on the wall (Hadar 22/10/2026, DECISIONS #41). Group tabs confused
-- guests: a guest answering a class message from the "everyone" tab sent the
-- answer to everyone. Now a message can be a reply, shown under the message
-- it answers, and a reply ALWAYS goes to exactly the same audience - set here,
-- whatever the client sends, so a class's conversation stays in the class.
--
--   reply_to  the message answered. Always a top-level one: a reply to a reply
--             is attached to its top-level message, so threads are one deep.
--   audience  of a reply = audience of its top-level message, on insert and on
--             every later change of either. Policies then apply as to any
--             message: a guest who cannot see the message cannot answer it
--             (messages_guest_insert: audience <@ own groups), and nobody sees
--             a reply they could not see the message for.
--
-- Only an approved message can be answered (a kid's waiting one cannot). A
-- kid's reply waits for a parent like any kid message (00049). Deleting a
-- message deletes its replies.

alter table messages
  add column reply_to uuid references messages(id) on delete cascade;

comment on column messages.reply_to is
  'The top-level message this one answers (00066). A reply always has its '
  'message''s audience - forced by messages_reply_guard.';

create index idx_messages_reply_to on messages(reply_to);

create or replace function public.messages_reply_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare parent messages%rowtype;
begin
  if new.reply_to is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.reply_to is distinct from old.reply_to then
    raise exception 'a reply cannot be moved' using errcode = '42501';
  end if;
  select * into parent from messages where id = new.reply_to;
  if not found then
    raise exception 'no such message' using errcode = '23503';
  end if;
  -- one level deep: a reply to a reply answers the top-level message
  if parent.reply_to is not null then
    new.reply_to := parent.reply_to;
    select * into parent from messages where id = new.reply_to;
  end if;
  if tg_op = 'INSERT' and (parent.approved_at is null or parent.trip_id <> new.trip_id) then
    raise exception 'only an approved message on this wall can be answered' using errcode = '42501';
  end if;
  new.channel := parent.channel;
  new.audience := parent.audience;
  return new;
end;
$$;
revoke execute on function public.messages_reply_guard() from public, anon, authenticated;

-- after messages_approval_guard / messages_bridge_guard (alphabetical order)
create trigger messages_reply_guard
  before insert or update on messages
  for each row execute function public.messages_reply_guard();

-- a parent changing who a message goes to takes its replies along
create or replace function public.messages_replies_follow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update messages set audience = new.audience
   where reply_to = new.id and audience is distinct from new.audience;
  return null;
end;
$$;
revoke execute on function public.messages_replies_follow() from public, anon, authenticated;

create trigger messages_replies_follow
  after update of audience on messages
  for each row
  when (new.reply_to is null and new.audience is distinct from old.audience)
  execute function public.messages_replies_follow();
