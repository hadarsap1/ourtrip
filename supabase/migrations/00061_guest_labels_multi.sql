-- A guest can belong to several groups (Hadar 22/10/2026): a family friend is
-- also a parent in Omer's class, and the two classes are separate groups.
--
-- `guests_allowlist.labels` replaces the single free-text `label` (00043).
-- Same meaning: addressing and managing the list only. No policy reads it,
-- every active guest still sees exactly the same content.
--
-- `label` is kept, unread, until guest-invite is redeployed with this change:
-- an older guest-invite still writes it and must not fail an invite. Drop it
-- in a later migration.

create function guest_labels_valid(p_labels text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(p_labels) <= 10
     and coalesce(bool_and(l is not null and char_length(l) between 1 and 40), true)
  from unnest(p_labels) as l
$$;

alter table guests_allowlist
  add column labels text[] not null default '{}'
    check (public.guest_labels_valid(labels));

update guests_allowlist set labels = array[label] where label is not null;

comment on column guests_allowlist.labels is
  'Groups for managing the guest list (family / Omer''s class / Ella''s class / '
  'friends); a guest may be in several. Addressing only: no policy reads it, '
  'every active guest sees the same content.';
comment on column guests_allowlist.label is
  'Deprecated by labels (00061). Not read by the app; drop once guest-invite '
  'no longer writes it.';
