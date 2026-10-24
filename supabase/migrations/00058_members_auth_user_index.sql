-- Load test (100 concurrent readers/writers on the wall): every RLS policy
-- resolves the caller through current_member_id(), which looks members up by
-- auth_user_id = auth.uid(). There was no index on that column, so each policy
-- check - per row, per policy, per query, and per subscriber on every realtime
-- change - scanned members. 00024 made the same point for kid_devices.
--
-- Index only: no policy, grant or function changes. RLS coverage unchanged.

create index if not exists idx_members_auth_user_id
  on members(auth_user_id)
  where auth_user_id is not null;
