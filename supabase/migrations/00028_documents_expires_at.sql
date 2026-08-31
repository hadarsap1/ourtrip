-- Redesign 3a (מסמכים): the screen's most valuable block is a warning that a
-- passport expires before the trip ends. `documents` had nowhere to record
-- that, so the warning could not exist.
--
-- Nullable on purpose: most documents have no meaningful expiry (a booking
-- confirmation, a packing list scan), and forcing a date on them would make the
-- warning noisy rather than useful. The screen compares this against
-- trips.end_date and says nothing when it is null.
--
-- RLS: no new policies. `documents` is owner-only (00001 documents_owner_all)
-- plus the single kid opt-in from 00014 (documents_kid_select, gated on
-- shared_with_kids). A column inherits the row's policies, so this adds no
-- visibility of its own — a kid or guest still cannot read any document row
-- they could not read before, expiry included.

alter table documents add column expires_at date;

-- The expiring-documents query is "this trip, has an expiry, sorted by it".
-- Partial so rows without an expiry — most of them — stay out of the index.
create index if not exists idx_documents_expires_at
  on documents(trip_id, expires_at) where expires_at is not null;

comment on column documents.expires_at is
  'Optional expiry date (passport, visa, insurance). Compared against '
  'trips.end_date to warn that a document lapses mid-trip.';
