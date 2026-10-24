#!/usr/bin/env bash
# Apply every migration to a throwaway local Postgres database and run the RLS
# probe files against it. Usage:
#   scripts/rls/run.sh                 # fresh DB "ourtrip_rls", all probes
#   scripts/rls/run.sh probes/x.sql    # only the given probe file(s)
# Needs a running local Postgres reachable as the `postgres` superuser
# (PGHOST/PGPORT/PGUSER honoured). No network, no Docker.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="${RLS_DB:-ourtrip_rls}"
PSQL=(psql -v ON_ERROR_STOP=1 -q -X)
if [ "$(id -u)" = 0 ] && [ -z "${PGUSER:-}" ]; then PSQL=(sudo -u postgres "${PSQL[@]}"); fi

"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB"
# roles are cluster-wide; ignore "already exists" on re-runs
"${PSQL[@]}" -d postgres -c "do \$\$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'drop owned by anon, authenticated, service_role';
    execute 'drop role anon'; execute 'drop role authenticated'; execute 'drop role service_role';
  end if; end \$\$" >/dev/null 2>&1 || true
"${PSQL[@]}" -d "$DB" -f scripts/rls/shim.sql 2>&1 | grep -v "wal_level\|HINT" || true

for f in supabase/migrations/*.sql; do
  # pg_cron / pg_net are shimmed as plain schemas; the extensions are not installed locally
  sed -E 's/^create extension if not exists (pg_cron|pg_net).*$/-- (shim) &/' "$f" \
    | "${PSQL[@]}" -d "$DB" -f - >/dev/null || { echo "FAILED applying $f" >&2; exit 1; }
done
echo "applied $(ls supabase/migrations/*.sql | wc -l) migrations to $DB"

probes=("$@")
if [ ${#probes[@]} -eq 0 ]; then probes=(scripts/rls/probes/*.sql); fi
for p in "${probes[@]}"; do
  echo "== $p"
  # query output is noise here; the probes report through PASS/FAIL notices
  "${PSQL[@]}" -d "$DB" -o /dev/null -f "$p" 2>&1 | sed -nE 's/.*NOTICE:  ((PASS|FAIL).*)/\1/p; /ERROR/p'
  [ "${PIPESTATUS[0]}" -eq 0 ] || { echo "probe failed: $p" >&2; exit 1; }
done
