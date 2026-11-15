#!/usr/bin/env bash
# The app with data, per role, on this machine: the RLS harness database
# (every migration applied), a demo family, PostgREST in front of it and a
# small proxy in Supabase's place. Every read goes through the real policies.
# Needs: a local Postgres (as scripts/rls/run.sh), Docker, Node.
#   scripts/uicrawl/up.sh          then follow what it prints
#   scripts/uicrawl/up.sh down     stop and drop
set -euo pipefail
cd "$(dirname "$0")/../.."
HERE=scripts/uicrawl
PSQL=(psql -v ON_ERROR_STOP=1 -q -X)
if [ "$(id -u)" = 0 ] && [ -z "${PGUSER:-}" ]; then PSQL=(sudo -u postgres "${PSQL[@]}"); fi
SECRET="local-ui-audit-secret-at-least-32-chars-long!!"

down() {
  docker rm -f ourtrip-uicrawl-pgrst >/dev/null 2>&1 || true
  pkill -f "$HERE/proxy.mjs" 2>/dev/null || true
  # the harness recreates the roles on its next run; this database would block that
  "${PSQL[@]}" -d postgres -c "drop database if exists ourtrip_ui" -c "drop role if exists authenticator" >/dev/null 2>&1 || true
}
if [ "${1:-}" = "down" ]; then down; echo "stopped"; exit 0; fi

down
scripts/rls/run.sh scripts/rls/probes/90_matrix.sql >/dev/null
"${PSQL[@]}" -d postgres -c "create database ourtrip_ui template ourtrip_rls" \
  -c "create role authenticator login password 'pw' noinherit" \
  -c "grant anon, authenticated, service_role to authenticator"
"${PSQL[@]}" -d ourtrip_ui -f "$HERE/seed.sql" >/dev/null
docker run -d --name ourtrip-uicrawl-pgrst --network host \
  -e PGRST_DB_URI="postgres://authenticator:pw@127.0.0.1:${PGPORT:-5432}/ourtrip_ui" \
  -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon \
  -e PGRST_JWT_SECRET="$SECRET" -e PGRST_SERVER_PORT=3001 \
  postgrest/postgrest:v12.2.3 >/dev/null
nohup node "$HERE/proxy.mjs" >/dev/null 2>&1 &
sleep 3
ANON=$(node "$HERE/jwt.mjs" anon)
cat <<MSG
up. Build and serve the app against it, then crawl:

  NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON npm run build
  npx next start -p 3200 &
  node $HERE/crawl.mjs owner,kid,guest,anon light,dark /tmp/ourtrip-shots

When done: $HERE/up.sh down   (and rebuild without the two variables before e2e)
MSG
