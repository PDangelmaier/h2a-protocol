#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="h2a-e2e-db"
POSTGREST_CONTAINER="h2a-e2e-postgrest"
DB_PORT="${E2E_DB_PORT:-5498}"
POSTGREST_PORT="${E2E_POSTGREST_PORT:-5497}"
DB_NAME="h2a_e2e"
DB_USER="postgres"
DB_PASS="e2e_pass"
DOCKER_NETWORK="h2a-e2e-net"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
MIGRATIONS_DIR="$PROJECT_ROOT/supabase/migrations"
SEEDS_DIR="$PROJECT_ROOT/supabase/seed"

JWT_SECRET="e2e-jwt-secret-at-least-32-characters-long-for-hs256"
SERVICE_ROLE_JWT=""

PSQL="psql -h 127.0.0.1 -p $DB_PORT -U $DB_USER -d $DB_NAME"
export PGPASSWORD="$DB_PASS"

cleanup() {
  if [ "${KEEP_CONTAINER:-}" = "1" ]; then
    echo "Containers kept alive (KEEP_CONTAINER=1)."
  else
    docker rm -f "$POSTGREST_CONTAINER" 2>/dev/null || true
    docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
    docker network rm "$DOCKER_NETWORK" 2>/dev/null || true
  fi
}
trap cleanup EXIT

generate_jwt() {
  node -e "
const crypto = require('crypto');
const header = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
const payload = Buffer.from(JSON.stringify({role:'service_role',iss:'supabase',iat:1735689600,exp:4891363200})).toString('base64url');
const sig = crypto.createHmac('sha256','$JWT_SECRET').update(header+'.'+payload).digest('base64url');
process.stdout.write(header+'.'+payload+'.'+sig);
"
}

echo "=== H2A E2E DB Setup ==="

docker rm -f "$POSTGREST_CONTAINER" 2>/dev/null || true
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
docker network rm "$DOCKER_NETWORK" 2>/dev/null || true
docker network create "$DOCKER_NETWORK" >/dev/null

docker run -d --name "$CONTAINER_NAME" --network "$DOCKER_NETWORK" \
  -e POSTGRES_DB="$DB_NAME" \
  -e POSTGRES_USER="$DB_USER" \
  -e POSTGRES_PASSWORD="$DB_PASS" \
  -p "$DB_PORT:5432" \
  pgvector/pgvector:pg16 \
  -c shared_preload_libraries='' >/dev/null

echo "Waiting for PostgreSQL..."
for i in $(seq 1 30); do
  if $PSQL -c "SELECT 1" >/dev/null 2>&1; then break; fi
  sleep 0.5
done

echo "Creating Supabase stub roles..."
$PSQL -q <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $f$
  SELECT '00000000-0000-0000-0000-000000000000'::uuid;
$f$ LANGUAGE sql STABLE;
GRANT ALL ON SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
SQL

echo "Running migrations..."
for f in "$MIGRATIONS_DIR"/*.sql; do
  $PSQL -q -f "$f" 2>&1 | grep -v "^NOTICE" || true
done

echo "Running seeds..."
for f in "$SEEDS_DIR"/*.sql; do
  $PSQL -q -f "$f" 2>&1 | grep -v "^NOTICE" || true
done

echo "Granting service_role access to all tables..."
$PSQL -q <<'SQL'
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', r.tablename);
  END LOOP;
  FOR r IN SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public' LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO service_role', r.sequence_name);
  END LOOP;
END $$;
SQL

echo "Starting PostgREST..."
docker run -d --name "$POSTGREST_CONTAINER" --network "$DOCKER_NETWORK" \
  -e PGRST_DB_URI="postgresql://$DB_USER:$DB_PASS@$CONTAINER_NAME:5432/$DB_NAME" \
  -e PGRST_DB_SCHEMAS="public" \
  -e PGRST_DB_ANON_ROLE="anon" \
  -e PGRST_JWT_SECRET="$JWT_SECRET" \
  -e PGRST_OPENAPI_MODE="disabled" \
  -e PGRST_DB_EXTRA_SEARCH_PATH="public" \
  -p "$POSTGREST_PORT:3000" \
  postgrest/postgrest:v12.2.3 >/dev/null

echo "Waiting for PostgREST..."
for i in $(seq 1 20); do
  if curl -sf "http://127.0.0.1:$POSTGREST_PORT/" >/dev/null 2>&1; then break; fi
  sleep 0.5
done

SERVICE_ROLE_JWT=$(generate_jwt)

TABLE_COUNT=$($PSQL -t -A -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")
echo "E2E DB ready: $TABLE_COUNT tables on port $DB_PORT, PostgREST on port $POSTGREST_PORT"

echo ""
echo "E2E_DB_URL=postgresql://$DB_USER:$DB_PASS@127.0.0.1:$DB_PORT/$DB_NAME"
echo "E2E_SUPABASE_URL=http://127.0.0.1:$POSTGREST_PORT"
echo "E2E_SUPABASE_SERVICE_KEY=$SERVICE_ROLE_JWT"
