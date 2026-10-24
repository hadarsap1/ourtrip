-- Kids read the comments on stories too (Hadar 14/10/2026, amends DECISIONS #34).
--
-- 00049 let kids read listeners' comments on episodes only. Now any comment on
-- something the kid can see - an episode or a story - is readable, still
-- read-only (no kid insert/update/delete policy on comments). ALTER, not
-- drop-and-create: the policy is never absent, not even inside the migration.

alter policy comments_kid_select on comments
  using (
    public.is_kid_of(trip_id)
    and public.feedback_target_visible(trip_id, post_id, episode_id)
  );
