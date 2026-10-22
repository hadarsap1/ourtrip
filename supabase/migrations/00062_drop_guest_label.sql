-- Drop guests_allowlist.label, replaced by labels in 00061.
--
-- Safe now: nothing reads or writes it. guest-invite (redeployed with 00061)
-- turns an old client's `label` into `labels` and never writes the column;
-- the app reads only `labels`. Backups taken before 00061 still carry a
-- `label` field: the restore dry run would just report those rows as changed.

alter table guests_allowlist drop column label;
