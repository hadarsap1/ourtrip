-- Rollback for 00105. Grids fall back to the full photo (the app reads
-- thumb_path as optional). The .thumb.jpg files stay in the bucket; they are
-- harmless and private.
create or replace function public.photos_guard_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.current_member_role() = 'kid' then
    new.status := case
      when old.status = 'approved' and new.caption is distinct from old.caption then 'pending'
      else old.status
    end;
    new.shared_with_guests := old.shared_with_guests;
    new.approved_by := old.approved_by;
    new.audience := old.audience;
    new.file_path := old.file_path;
    new.trip_id := old.trip_id;
    new.uploaded_by := old.uploaded_by;
    new.taken_on := old.taken_on;
    new.media_type := old.media_type;
    new.poster_path := old.poster_path;
    new.duration_seconds := old.duration_seconds;
  end if;
  return new;
end;
$$;
revoke execute on function public.photos_guard_update() from public, anon, authenticated;
alter table photos drop column if exists thumb_path;
