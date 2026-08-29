-- Shared secret for the pg_cron-invoked Edge Functions
-- (security review 2026-08, findings M3 + M4).
--
-- THE PROBLEM. `fx-daily`, `push-send` and `backup-weekly` run with
-- `verify_jwt = false`, because pg_cron and pg_net carry no JWT. That left
-- all three invokable by anyone who knows the project URL:
--
--   * `backup-weekly` dumps every trip table to the private `backups` bucket
--     and returns the path plus a per-table row count. The bucket policy holds
--     — an anonymous caller cannot read the file — but they can trigger
--     unlimited dumps, and the object contains messages, emergency_info
--     (insurance policy, blood type, allergies), kid_devices and
--     push_subscriptions, all behind that one policy.
--   * `push-send` with `{"type":"daily"}` sends a real push to every phone in
--     the family. No content leaks (the ids are unguessable UUIDs), but the
--     family can be spammed with notifications at 3am.
--
-- THE FIX. The jobs now send an `x-cron-secret` header, read from a database
-- setting, and the functions compare it against their `CRON_SECRET` function
-- secret in constant time.
--
-- TWO-SIDED, SO IT ROLLS OUT SAFELY. The functions deliberately fail OPEN
-- while `CRON_SECRET` is unset: shipping the check before the secret exists
-- would stop FX, push and backups with nothing surfacing the failure — the
-- exact silent breakage supabase/config.toml exists to prevent. Setting the
-- secret on both sides is what switches enforcement on:
--
--   1. generate one:      openssl rand -hex 32
--   2. database side:     alter database postgres
--                           set app.settings.cron_secret = '<value>';
--   3. function side:     set CRON_SECRET to the same value for
--                         fx-daily, push-send and backup-weekly
--                         (Supabase dashboard → Edge Functions → Secrets)
--
-- Until step 3, `coalesce(...,'')` below sends an empty header and the
-- functions accept it, so nothing breaks in the meantime.
--
-- Note on where the secret lives: `app.settings.cron_secret` is readable by
-- any database session, same as `app.settings.functions_base_url`. That is
-- acceptable here because no client role has raw SQL access — kids, guests and
-- owners reach Postgres only through PostgREST, which exposes no
-- `current_setting` RPC. Supabase Vault would be the stricter home for it, and
-- more machinery than this app needs.

create or replace function public.cron_secret_header()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-secret', coalesce(current_setting('app.settings.cron_secret', true), '')
  );
$$;

comment on function public.cron_secret_header() is
  'Headers for pg_cron/pg_net calls into Edge Functions: content type plus the '
  'shared secret from app.settings.cron_secret. See migration 00025.';

-- Same posture as the other internal helpers (00002, 00019): nothing
-- client-facing calls this, and it must not become a way to read the secret.
revoke execute on function public.cron_secret_header() from public;
revoke execute on function public.cron_secret_header() from anon;
revoke execute on function public.cron_secret_header() from authenticated;

-- ============ CRON JOBS ============
-- Bodies are identical to 00019 apart from the headers argument. The helper is
-- called INSIDE the job body, so rotating the secret takes effect on the next
-- firing with no migration and no redeploy.

select cron.schedule(
  'fx-daily',
  '30 4 * * *',
  $job$
  select net.http_post(
    url := public.functions_base_url() || '/fx-daily',
    headers := public.cron_secret_header(),
    body := '{}'::jsonb
  );
  $job$
);

select cron.schedule(
  'push-daily',
  '0 5 * * *',
  $job$
  select net.http_post(
    url := public.functions_base_url() || '/push-send',
    headers := public.cron_secret_header(),
    body := '{"type": "daily"}'::jsonb
  );
  $job$
);

select cron.schedule(
  'backup-weekly',
  '0 3 * * 0',
  $job$
  select net.http_post(
    url := public.functions_base_url() || '/backup-weekly',
    headers := public.cron_secret_header(),
    body := '{}'::jsonb
  );
  $job$
);

-- ============ NOTIFICATION TRIGGERS ============
-- These reach push-send too (00010), so they need the secret as well —
-- otherwise enabling enforcement would silently kill wall-message and
-- pending-photo notifications while the daily digest kept working.

create or replace function public.notify_wall_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := public.functions_base_url() || '/push-send',
    headers := public.cron_secret_header(),
    body := jsonb_build_object('type', 'wall-message', 'message_id', new.id)
  );
  return new;
end;
$$;

revoke execute on function public.notify_wall_message() from public, anon, authenticated;

create or replace function public.notify_pending_photo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending' then
    perform net.http_post(
      url := public.functions_base_url() || '/push-send',
      headers := public.cron_secret_header(),
      body := jsonb_build_object('type', 'pending-photo', 'photo_id', new.id)
    );
  end if;
  return new;
end;
$$;

revoke execute on function public.notify_pending_photo() from public, anon, authenticated;
