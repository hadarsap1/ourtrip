-- Lets geocode-places make forward progress over a large options bank.
--
-- THE BUG THIS FIXES: geocode-places picked its work with
--   .is("lat", null).limit(20)
-- and a row that failed to resolve kept its null coordinates. So every call
-- re-read the SAME first twenty unresolved rows, retried the same hopeless
-- queries, and returned the same "remaining" count. The client loops twenty
-- times per press; all twenty passes burned on those twenty rows. With 325
-- unresolved options, rows 21..325 were never once handed to a geocoder — not
-- a quota problem, a paging problem.
--
-- A counter is the smallest thing that fixes it: failures advance it, the
-- pending query skips rows that have used up their attempts, and the batch
-- therefore always moves on. It also keeps a bounded number of retries across
-- sessions, since a miss is often a thin query rather than a permanent one
-- (the provider chain in the function changed too, so old failures deserve
-- another look).
alter table place_options
  add column geocode_attempts smallint not null default 0;

comment on column place_options.geocode_attempts is
  'How many times geocode-places has tried and failed to resolve this row. Reset to 0 to re-queue a place. Rows at or above the function''s cap are left alone.';

-- The exact predicate the function's pending query uses. Partial, so it stays
-- small: it only indexes rows still waiting for coordinates, which is a set
-- that shrinks to nothing as the bank gets located.
create index place_options_pending_geocode_idx
  on place_options (trip_id, geocode_attempts, created_at)
  where lat is null;

-- No policy changes: place_options_owner_all already covers every column of
-- this table for owners, and the new column is written only through that same
-- owner-scoped path (the function uses the CALLER's client, not service role).
