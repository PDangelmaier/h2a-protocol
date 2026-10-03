#!/usr/bin/env bash
set -euo pipefail

# test:live — Live Smoke-Test against real Nexus (D-019, D-025 §2)
# Required: NEXUS_ENDPOINT + NEXUS_PRD_KEY (from Doppler)
# NOT required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (uses local DB)
# Runs via: doppler run --project h2a --config dev -- pnpm test:live

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# AC-4: Only Nexus credentials required
REQUIRED_VARS=(NEXUS_ENDPOINT NEXUS_PRD_KEY)
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var:-}" ]; then
    echo "FAIL: Missing $var"
    echo "Run via: doppler run --project h2a --config dev -- pnpm test:live"
    exit 1
  fi
done

echo "=== H2A test:live (D-019 limits: 20 calls, 50K tokens, synthetic only) ==="
echo "NEXUS_ENDPOINT: set"

# Start local DB if not already running
if ! docker ps --format '{{.Names}}' | grep -q "h2a-e2e-db"; then
  echo "Starting local PostgreSQL+PostgREST..."
  KEEP_CONTAINER=1 E2E_DB_PORT=5499 E2E_POSTGREST_PORT=5496 \
    bash "$SCRIPT_DIR/e2e-db-setup.sh"
fi

# Detect PostgREST port from running container
POSTGREST_PORT=$(docker port h2a-e2e-postgrest 3000 2>/dev/null | head -1 | cut -d: -f2)
if [ -z "$POSTGREST_PORT" ]; then
  POSTGREST_PORT=5496
fi

# Generate JWT (same logic as e2e-db-setup.sh)
JWT_SECRET="e2e-jwt-secret-at-least-32-characters-long-for-hs256"
SERVICE_ROLE_JWT=$(node -e "
const crypto = require('crypto');
const header = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
const payload = Buffer.from(JSON.stringify({role:'service_role',iss:'supabase',iat:1735689600,exp:4891363200})).toString('base64url');
const sig = crypto.createHmac('sha256','$JWT_SECRET').update(header+'.'+payload).digest('base64url');
process.stdout.write(header+'.'+payload+'.'+sig);
")

export E2E_SUPABASE_URL="http://127.0.0.1:$POSTGREST_PORT"
export E2E_SUPABASE_SERVICE_KEY="$SERVICE_ROLE_JWT"

echo "Local DB: $E2E_SUPABASE_URL"

cd "$PROJECT_ROOT/packages/mb-agent"
npx vitest run live/ --reporter=verbose 2>&1

echo "=== test:live completed ==="
