-- Who tells an episode (Hadar 01/11/2026): "מספרים" showed the member whose
-- phone recorded it - a parent's name on the kids' episodes. An episode now
-- names its narrators: the kids by default, any of the four of us, or a
-- name typed in (a friend met on the way). Names, not member ids: a guest
-- reads them as they are, and a typed name has no member.
--
-- No policy change. Only parents write episodes since 00049
-- (episodes_owner_all); kids and guests read the column through the select
-- policies that already decide which episodes they hear.

alter table episodes
  add column narrators text[] not null default '{}'
    check (
      cardinality(narrators) <= 8
      and char_length(array_to_string(narrators, '')) <= 240
    );

comment on column episodes.narrators is
  'Who tells the episode, as shown ("עומר ואלה"). Not who recorded it (00079).';

-- the episodes so far: the kids, the way the podcast was meant
update episodes e
   set narrators = coalesce((
     select array_agg(m.display_name order by m.created_at)
       from members m
      where m.trip_id = e.trip_id and m.role = 'kid' and not m.is_preview
   ), '{}');
