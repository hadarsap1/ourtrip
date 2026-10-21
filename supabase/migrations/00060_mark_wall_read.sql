-- Load test, round 2: opening the wall marked every message on it read by
-- upserting the whole id list (300+ rows) per open. With 100 people opening
-- at once that request held the API's connections for 3-8 s each and
-- everything else queued behind it; one hit the app's 10 s limit. Rows
-- already read still paid the WITH CHECK of both message_reads policies.
--
-- mark_wall_read(trip) inserts read rows only for the wall messages that do
-- not have one yet, in one statement, with no id list over the wire.
--
-- SECURITY INVOKER on purpose: it reads messages under the caller's own RLS
-- (a guest never marks a kid's pending message, nobody marks another trip's
-- wall) and inserts under message_reads' own WITH CHECK (member_id =
-- current_member_id()). It can do nothing the client could not already do
-- with markRead. Own messages are skipped: the unread badge never counts them.
-- Probe: scripts/rls/probes/60_mark_wall_read.sql.

create or replace function public.mark_wall_read(p_trip_id uuid)
returns integer
language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_member uuid := public.current_member_id();
  v_count integer;
begin
  if v_member is null then
    return 0;
  end if;
  insert into message_reads (message_id, member_id)
  select m.id, v_member
    from messages m
   where m.trip_id = p_trip_id
     and m.channel = 'guests'
     and m.sender_id <> v_member
     and not exists (
       select 1 from message_reads r where r.message_id = m.id and r.member_id = v_member
     )
  on conflict (message_id, member_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.mark_wall_read(uuid) from public, anon;
grant execute on function public.mark_wall_read(uuid) to authenticated;
