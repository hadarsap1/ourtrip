-- QA review 2026-09, finding S2.
--
-- `photos_kid_update_own` guarded the OLD row properly - a kid may only touch a
-- photo of their own, on a trip they are a kid of - but its WITH CHECK, which
-- guards the NEW row, only asserted `uploaded_by = current_member_id()`. Nothing
-- in the policy stopped a kid rewriting `trip_id` to some other trip and taking
-- their photo with them.
--
-- No impact today: DECISIONS #8 means one active trip, and the two guard
-- triggers (photos_enforce_kid_rules, photos_guard_update) still pin status,
-- shared_with_guests and approved_by, so the approval rule of CLAUDE.md #3 was
-- never reachable this way. But a policy should say what it means, and the
-- protection of a hard rule should not rest on there happening to be only one
-- trip.
--
-- Re-asserting is_kid_of(trip_id) in the WITH CHECK makes the new row obey the
-- same condition as the old one.

drop policy if exists photos_kid_update_own on public.photos;

create policy photos_kid_update_own on public.photos
  for update
  using (is_kid_of(trip_id) and uploaded_by = current_member_id())
  with check (is_kid_of(trip_id) and uploaded_by = current_member_id());
