-- Replies to comments (Hadar 23/11/2026). A comment on an update, an episode
-- or a photo can answer another comment; it shows under the comment it
-- answers, like replies on the wall (00066).
--
--   reply_to  the comment answered. Always a top-level one: a reply to a reply
--             is attached to its top-level comment, so threads are one deep.
--             A reply is always on the same trip and target as its comment -
--             set here, whatever the client sends. The policies then apply as
--             to any comment: a guest can only write on a target they can see
--             (comments_guest_insert), so answering a comment id they cannot
--             see fails the same way.
--
-- A reply cannot be moved to another comment. Deleting a comment deletes its
-- replies. No new policies: reply_to rides on the existing ones.

alter table comments
  add column reply_to uuid references comments(id) on delete cascade;

comment on column comments.reply_to is
  'The top-level comment this one answers (00102). Same trip and target as '
  'that comment - forced by comments_reply_guard.';

create index idx_comments_reply_to on comments(reply_to);

create or replace function public.comments_reply_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare parent comments%rowtype;
begin
  if tg_op = 'UPDATE' and new.reply_to is distinct from old.reply_to then
    raise exception 'a reply cannot be moved' using errcode = '42501';
  end if;
  if new.reply_to is null then
    return new;
  end if;
  select * into parent from comments where id = new.reply_to;
  if not found then
    raise exception 'no such comment' using errcode = '23503';
  end if;
  -- one level deep: a reply to a reply answers the top-level comment
  if parent.reply_to is not null then
    new.reply_to := parent.reply_to;
    select * into parent from comments where id = new.reply_to;
  end if;
  if parent.trip_id <> new.trip_id then
    raise exception 'only a comment on this trip can be answered' using errcode = '42501';
  end if;
  new.post_id := parent.post_id;
  new.episode_id := parent.episode_id;
  new.photo_id := parent.photo_id;
  return new;
end;
$$;
revoke execute on function public.comments_reply_guard() from public, anon, authenticated;

-- runs after comments_edit_guard (alphabetical order), before RLS checks
create trigger comments_reply_guard
  before insert or update on comments
  for each row execute function public.comments_reply_guard();
