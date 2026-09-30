#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="h2a-db-verify"
DB_PORT=5499
DB_NAME="h2a_verify"
DB_USER="postgres"
DB_PASS="verify_pass"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
MIGRATIONS_DIR="$PROJECT_ROOT/supabase/migrations"
SEEDS_DIR="$PROJECT_ROOT/supabase/seed"

cleanup() {
  echo "Cleaning up..."
  docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
}
trap cleanup EXIT

echo "=== H2A db:verify ==="
echo "Starting PostgreSQL 16 + pgvector..."

docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
docker run -d --name "$CONTAINER_NAME" \
  -e POSTGRES_DB="$DB_NAME" \
  -e POSTGRES_USER="$DB_USER" \
  -e POSTGRES_PASSWORD="$DB_PASS" \
  -p "$DB_PORT:5432" \
  pgvector/pgvector:pg16 >/dev/null

echo "Waiting for PostgreSQL to be ready..."
for i in $(seq 1 30); do
  if docker exec "$CONTAINER_NAME" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

PSQL="docker exec -i $CONTAINER_NAME psql -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1"

echo "Setting up Supabase stubs (roles, extensions, auth schema)..."
$PSQL <<'SQL'
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $f$
  SELECT '00000000-0000-0000-0000-000000000000'::uuid;
$f$ LANGUAGE sql STABLE;
SQL

FAIL_COUNT=0
PASS_COUNT=0

echo ""
echo "--- Migrations ---"
for migration in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
  fname=$(basename "$migration")
  if $PSQL < "$migration" >/dev/null 2>&1; then
    echo "  ok   $fname"
    ((PASS_COUNT++))
  else
    echo "  FAIL $fname"
    $PSQL < "$migration" 2>&1 | grep -i "error\|hint" | head -3 || true
    ((FAIL_COUNT++))
  fi
done

echo ""
echo "--- Seeds ---"
for seed in $(ls "$SEEDS_DIR"/*.sql 2>/dev/null | sort); do
  fname=$(basename "$seed")
  if $PSQL < "$seed" >/dev/null 2>&1; then
    echo "  ok   $fname"
    ((PASS_COUNT++))
  else
    echo "  FAIL $fname"
    $PSQL < "$seed" 2>&1 | grep -i "error\|hint" | head -3 || true
    ((FAIL_COUNT++))
  fi
done

echo ""
echo "--- Summary ---"
echo "  Passed: $PASS_COUNT"
echo "  Failed: $FAIL_COUNT"

if [ "$FAIL_COUNT" -gt 0 ]; then
  echo ""
  echo "FAIL: $FAIL_COUNT migration(s)/seed(s) failed."
  exit 1
else
  echo ""
  echo "ALL PASSED: All migrations and seeds applied successfully."
  exit 0
fi
