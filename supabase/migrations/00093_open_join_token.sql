-- The app's address is the one link a guest keeps (Hadar 15/11/2026).
--
-- After approval the WhatsApp message gives the app's address, not a
-- one-time sign-in link: an approved guest who is still signed in just opens
-- it, one who is not types their email (guest-login-link, 00075) or signs in
-- with Google. Someone who opens it and was never approved gets "ask to join"
-- on the login screen, which goes to the trip's join page (00054). The join
-- link itself does not change - it is printed as a QR code.
--
-- For that the login screen, before anyone is signed in, needs the active
-- trip's join token. This hands it out. What anyone can do with it is what
-- the printed QR already allows: ask to join. A request grants nothing until
-- a parent approves (every guest policy still goes through
-- is_active_guest_of()), and submit_guest_join's rate limits stand.
-- Returns null when the trip has no join link yet; never creates one.

create or replace function public.guest_join_open_token()
returns text
language sql stable security definer set search_path = ''
as $$
  select l.token
    from public.guest_join_links l
    join public.trips t on t.id = l.trip_id and t.is_active
   order by t.created_at desc
   limit 1;
$$;

revoke execute on function public.guest_join_open_token() from public;
grant execute on function public.guest_join_open_token() to anon, authenticated;
