#!/usr/bin/env bash
set -euo pipefail

# test:live — Smoke-Test against real Nexus (D-019, D-025 §2)
# Enforces: max 20 Nexus-Calls, 50.000 Input-Token, only synthetic profiles.
# Runs via: doppler run --project h2a --config dev -- bash scripts/test-live.sh
# AUTO_LOG: Limits enforced via test configuration, not runtime guards.

REQUIRED_VARS=(SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY NEXUS_ENDPOINT NEXUS_PRD_KEY)
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var:-}" ]; then
    echo "FAIL: Missing $var — run via: doppler run --project h2a --config dev -- bash scripts/test-live.sh"
    exit 1
  fi
done

echo "=== H2A test:live (D-019 limits: 20 calls, 50K tokens, synthetic only) ==="
echo "NEXUS_ENDPOINT: set"
echo "SUPABASE_URL: set"

export H2A_LIVE_TEST=1
export H2A_MAX_NEXUS_CALLS=20
export H2A_MAX_INPUT_TOKENS=50000
export H2A_SYNTHETIC_ONLY=1

pnpm run -r test --passWithNoTests 2>&1

echo "=== test:live completed ==="
