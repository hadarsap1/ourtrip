-- What each member has already seen of the likes and comments (Hadar
-- 02/11/2026: "I need to see on the card itself that there are comments,
-- otherwise I open them one by one"). In-app only - no push.
--
-- One row per member and target (a story, an episode or a photo): when the
-- member last looked at that target's likes and comments. A card shows "new"
-- for feedback from someone else written after that moment.
--
-- target_id has no foreign key on purpose: it is a story's, an episode's or a
-- photo's id, and a stale row for a deleted target is harmless. Nothing here
-- reveals content: a row holds only an id the member already had and a time.
--
-- RLS: a member reads and writes their own rows only, whatever the role.
-- A guest who is revoked keeps nothing visible through this table either -
-- the content itself stays behind its own policies.

create table feedback_seen (
  member_id uuid not null references members(id) on delete cascade,
  target_id uuid not null,
  seen_at timestamptz not null default now(),
  primary key (member_id, target_id)
);

alter table feedback_seen enable row level security;

create policy feedback_seen_own on feedback_seen
  for all
  using (member_id = (select public.current_member_id()))
  with check (member_id = (select public.current_member_id()));

grant select, insert, update, delete on feedback_seen to authenticated;
