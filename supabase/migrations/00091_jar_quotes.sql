-- "הישר לצנצנת" - what the kids said on the trip: sayings and slips of the
-- tongue, kept as a family memory (Hadar 15/11/2026).
--
-- A quote has who said it (one or more family members, and/or a free-text
-- name for someone outside the family: a cousin, a guide), what was said,
-- optionally what was meant (the correct form of a slip of the tongue), and
-- optionally a paragraph of background. The date and the country are stamped
-- when it is written - the trip is multi-country, so the country comes from
-- the itinerary day, never from a fixed destination.
--
-- Access:
--   * parents write, edit and delete (jar_quotes_owner_all)
--   * kids read, and only read (jar_quotes_kid_select) - they cannot add a
--     quote, so nothing waits for approval
--   * guests read a quote ONLY when a parent switched shared_with_guests on
--     for it (jar_quotes_guest_select). The default is family-only; there is
--     no trip-wide switch, each quote is a parent's decision
--   * anon / revoked guests / other trips: nothing (no policy matches)
--
-- said_by holds members ids. An array cannot carry a foreign key, so a trigger
-- checks every id is a parent or kid of the same trip - a guest or another
-- trip's member can never be named as the speaker. "Someone said it" (at
-- least one speaker) is a form rule, kept in the UI.
-- Probes: scripts/rls/probes/91_jar_quotes.sql.

create table jar_quotes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  quote text not null check (length(btrim(quote)) > 0),
  -- "הכוונה הייתה ל..." - the correct form of a slip of the tongue
  meant text,
  background text,
  said_by uuid[] not null default '{}',
  said_by_other text[] not null default '{}',
  said_on date not null default current_date,
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  shared_with_guests boolean not null default false,
  created_by uuid references members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jar_quotes_trip_said_on on jar_quotes (trip_id, said_on desc, created_at desc);
create index jar_quotes_created_by on jar_quotes (created_by);

create trigger jar_quotes_updated_at before update on jar_quotes
  for each row execute function public.set_updated_at();

-- every speaker is a parent or a kid of this trip
create or replace function public.jar_quotes_check_speakers()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from unnest(new.said_by) as s(id)
     where not exists (
       select 1 from members m
        where m.id = s.id and m.trip_id = new.trip_id and m.role in ('owner', 'kid')
     )
  ) then
    raise exception 'jar_quotes: said_by must be family members of the trip'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke execute on function public.jar_quotes_check_speakers() from public, anon, authenticated;

create trigger jar_quotes_speakers before insert or update of said_by, trip_id on jar_quotes
  for each row execute function public.jar_quotes_check_speakers();

alter table jar_quotes enable row level security;

create policy jar_quotes_owner_all on jar_quotes
  for all using (trip_id = (select public.member_trip_as('owner')))
  with check (trip_id = (select public.member_trip_as('owner')));

create policy jar_quotes_kid_select on jar_quotes
  for select using (trip_id = (select public.member_trip_as('kid')));

create policy jar_quotes_guest_select on jar_quotes
  for select using (
    trip_id = (select public.active_guest_trip())
    and shared_with_guests = true
  );

-- both parents' phones see a new quote without reopening the screen; realtime
-- delivers a row only to subscribers the SELECT policies above admit
alter publication supabase_realtime add table public.jar_quotes;
