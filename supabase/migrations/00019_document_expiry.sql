-- Document expiry tracking (audit finding M-1).
--
-- The vault tags documents passport / insurance / vaccine / visa, but stored no
-- expiry date, so nothing could warn about the dates that actually strand a
-- family mid-trip: the six-months-remaining passport validity rule most border
-- controls apply, children's shorter passport terms (four passports, four
-- different dates), visa entry windows, and the travel-insurance end date.
--
-- Owner-only planning content, so `documents_owner_all` (00001) already covers
-- reads and writes — no new policy. Kids read only `shared_with_kids` rows
-- (00014) and see the column on those; it carries no more sensitivity than the
-- document itself, which they are already allowed to open.
--
-- Nullable by design: most documents (a hotel voucher, a packing photo) never
-- expire, and forcing a date would train the family to enter junk.

alter table documents add column expires_on date;

-- Partial index: the daily digest asks "which documents expire on date X",
-- and the vast majority of rows carry no date at all.
create index idx_documents_expires_on
  on documents(trip_id, expires_on)
  where expires_on is not null;
