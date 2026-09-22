-- Several attachments per booking.
--
-- WHY A TABLE AND NOT AN ARRAY. `bookings.file_path` held exactly one path,
-- which is wrong for how bookings actually arrive: a flight is a confirmation
-- PDF plus two boarding passes, a car rental is the voucher plus the insurance
-- page. A `text[]` column would have carried the paths and nothing else - no
-- original file name (the stored path is prefixed with a timestamp), no size,
-- no way to delete one file without a read-modify-write of the whole array
-- from two phones at once. One row per file costs a table and buys all three.
--
-- The storage side needs nothing new: 00003 already made `booking-files` a
-- private bucket with four owner-only policies on storage.objects, and those
-- are bucket-wide, not per-path.

create table if not exists booking_files (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  -- Path inside the 'booking-files' bucket. Unique: two rows pointing at one
  -- object would make "delete this file" delete someone else's too.
  file_path text not null unique,
  -- The name as it was picked on the phone. The stored path cannot stand in
  -- for it: it is timestamp-prefixed and stripped of every non-ASCII
  -- character, so a Hebrew file name survives only here.
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  -- Display order within one booking. The confirmation goes first, the
  -- boarding passes after it, and that is worth keeping across devices.
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists booking_files_booking_id_idx
  on booking_files (booking_id, sort_order, created_at);

-- ============ RLS ============
-- booking_files has no trip_id of its own, so it joins through its booking,
-- the same shape as itinerary_items -> itinerary_days in 00001. Kids and
-- guests have no policy on `bookings` at all, so this returns them zero rows.

alter table booking_files enable row level security;

drop policy if exists booking_files_owner_all on booking_files;
create policy booking_files_owner_all on booking_files
  for all using (
    exists (
      select 1 from bookings b
      where b.id = booking_files.booking_id and public.is_owner_of(b.trip_id)
    )
  ) with check (
    exists (
      select 1 from bookings b
      where b.id = booking_files.booking_id and public.is_owner_of(b.trip_id)
    )
  );

-- ============ BACKFILL ============
-- Every attachment saved before this migration, moved into a row. The file
-- name is recovered from the path: uploadBookingFile wrote
-- `<booking id>/<epoch ms>-<sanitised name>`, so dropping the directory and
-- the numeric prefix gets the name back, minus the sanitising.

insert into booking_files (booking_id, file_path, file_name, sort_order)
select
  b.id,
  b.file_path,
  regexp_replace(split_part(b.file_path, '/', 2), '^[0-9]+-', ''),
  0
from bookings b
where b.file_path is not null
on conflict (file_path) do nothing;

-- ============ KEEPING bookings.file_path HONEST ============
-- The column stays, holding the first file, for two reasons: the weekly backup
-- dumps `bookings` and would otherwise lose the link entirely, and anything
-- still reading it keeps working instead of silently seeing null. A trigger
-- owns it now, so it cannot drift from the table that actually holds the data.
--
-- The UPDATE is not only bookkeeping: the bookings screen subscribes to
-- postgres_changes on `bookings`, not on `booking_files`, so it is what
-- carries "a file was added on the other phone" to the other device. That
-- holds for the second and third attachment too, where the first file - and
-- so file_path - does not change at all. `bookings_set_updated_at` (00001)
-- stamps updated_at on the way through, so this does not set it by hand.
--
-- Not SECURITY DEFINER: the only role that reaches this trigger is one whose
-- INSERT passed booking_files_owner_all above, and that role already holds
-- UPDATE on the booking through bookings_owner_all. Running as the caller
-- keeps RLS in the path instead of stepping around it.

create or replace function public.booking_files_sync_parent()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  -- Both sides, because an UPDATE can move a file from one booking to another
  -- and then two parents are stale. NEW and OLD are read only where they
  -- exist: in PL/pgSQL, reading NEW on a DELETE raises rather than returning
  -- null, so TG_OP has to decide and coalesce cannot.
  targets uuid[] := case tg_op
    when 'INSERT' then array[new.booking_id]
    when 'DELETE' then array[old.booking_id]
    else array[new.booking_id, old.booking_id]
  end;
begin
  -- On a cascade from `delete from bookings`, the parent row is already gone
  -- by the time the FK fires this, so the update simply matches nothing.
  update bookings b
  set file_path = (
        select f.file_path from booking_files f
        where f.booking_id = b.id
        order by f.sort_order, f.created_at
        limit 1
      )
  where b.id = any(targets);
  return null;
end;
$$;

-- 00002's rule: a trigger function is never called over the REST RPC surface.
revoke execute on function public.booking_files_sync_parent()
  from public, anon, authenticated;

drop trigger if exists booking_files_sync_parent_trg on booking_files;
create trigger booking_files_sync_parent_trg
  after insert or update or delete on booking_files
  for each row execute function public.booking_files_sync_parent();
