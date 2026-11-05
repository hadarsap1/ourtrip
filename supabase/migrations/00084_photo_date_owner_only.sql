-- 00084: a photo's day (taken_on) is the owners' to change (Hadar 05/11/2026).
-- The day decides the photo's place on the photos screen. Parents can now move
-- a photo to the day it was really taken; a kid's update keeps the old day.
-- Same function as 00076 plus the one pinned column.

create or replace function public.photos_guard_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.current_member_role() = 'kid' then
    -- new words on an approved photo wait for a parent again (00076)
    new.status := case
      when old.status = 'approved' and new.caption is distinct from old.caption then 'pending'
      else old.status
    end;
    new.shared_with_guests := old.shared_with_guests;
    new.approved_by := old.approved_by;
    new.audience := old.audience;
    -- the file and its ownership are not the kid's to change (00052)
    new.file_path := old.file_path;
    new.trip_id := old.trip_id;
    new.uploaded_by := old.uploaded_by;
    -- nor the day, which is the photo's place (00084)
    new.taken_on := old.taken_on;
  end if;
  return new;
end;
$$;
revoke execute on function public.photos_guard_update() from public, anon, authenticated;
