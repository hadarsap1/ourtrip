-- The journal is the family's own (DECISIONS #32, Hadar 14/10/2026).
--
-- Guests could read journal entries a parent ticked "share with guests", and
-- since 00043 they also read stories - two places telling them the same day.
-- Now the journal is the family's diary (owners + kids, the kids' daily
-- prompt, the memory book) and stories are the one thing that goes out. An
-- entry reaches guests only by becoming a story ("הפיכה לסיפור"), which goes
-- through the story's own audience and approval (00043).
--
-- The column goes, not just the policy: with nothing to tick there is no way
-- to share an entry by mistake, and no flag a later policy could read.
-- Photos attached to an entry are unaffected - a photo reaches guests only
-- when it is itself approved AND shared (DECISIONS #5).

drop policy if exists journal_entries_guest_select on journal_entries;

-- the only job of this trigger was to stop kids from setting the flag
drop trigger if exists journal_before_write on journal_entries;
drop function if exists public.journal_guard_kid();

alter table journal_entries drop column shared_with_guests;
