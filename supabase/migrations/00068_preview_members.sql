-- "View as a guest / as a kid" (Hadar 23/10/2026): a parent checks that a
-- feature or a flow works for the other roles before the class sees it.
--
-- A preview is a REAL session of a real member, so every screen goes through
-- the same RLS a guest or a kid gets - a UI-only switch would still read with
-- the parent's rights and show things a guest never sees. Each trip gets at
-- most one test guest ("🧪 אורח בדיקה") and one test kid ("🧪 ילד בדיקה"),
-- created and signed in by the preview-session Edge Function, which only a
-- parent can call:
--
--   * the test guest has a guests_allowlist row like any guest (address on
--     preview.ourtrip.app, which no mailbox receives); the parent picks its
--     groups on every entry, so group content can be checked class by class
--   * the test kid has a kid_devices row like any kid (00024), whose token
--     nobody holds: it cannot be unlocked from a tablet
--   * both sign in with a password rotated on every entry and never shown,
--     the same way kid-auth mints a kid session
--
-- What they write is real and seen by others, under the 🧪 name; a parent
-- deletes it as any other message. is_preview only keeps them out of the
-- parents' management lists (kids, devices, guests). No policy reads it, so
-- the test members see exactly what their role sees.

alter table members add column is_preview boolean not null default false;

comment on column members.is_preview is
  'The trip''s test guest / test kid for "view as" (00068). Hidden from the '
  'parents'' management lists only; no policy reads it.';

-- one test member per role per trip; the Edge Function finds it by this
create unique index members_one_preview_per_role
  on members (trip_id, role) where is_preview;
