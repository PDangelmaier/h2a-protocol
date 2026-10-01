#!/usr/bin/env bash
set -euo pipefail

# SPEC-040 AC-2: Automated invariant checks for CI
# Checks: INV-01, INV-02, INV-03, INV-22

FAIL=0

echo "=== Invariant Check ==="

# INV-01: No Messages API format (anthropic.messages, /v1/messages)
echo -n "INV-01 (no Messages API)... "
if grep -rn --include="*.ts" -E '(anthropic\.messages|/v1/messages)' packages/ supabase/ \
  | grep -v node_modules | grep -v __tests__ | grep -v '.d.ts'; then
  echo "FAIL: Messages API references found"
  FAIL=1
else
  echo "ok"
fi

# INV-02: No Bedrock-native model IDs (anthropic.claude-*)
echo -n "INV-02 (no Bedrock-native model IDs)... "
if grep -rn --include="*.ts" 'anthropic\.claude' packages/ supabase/ \
  | grep -v node_modules | grep -v __tests__ | grep -v '.d.ts'; then
  echo "FAIL: Bedrock-native model IDs found"
  FAIL=1
else
  echo "ok"
fi

# INV-03: No model ID literals outside migrations, seeds, and tests
echo -n "INV-03 (no model ID literals)... "
if grep -rn --include="*.ts" -E "'claude-[a-z]+-[0-9]" packages/ supabase/ \
  | grep -v node_modules | grep -v __tests__ | grep -v '.d.ts' \
  | grep -v 'migrations/' | grep -v 'seeds/'; then
  echo "FAIL: Model ID literals in production code"
  FAIL=1
else
  echo "ok"
fi

# INV-22: No .env files committed, no NEXUS_BEARER_TOKEN
echo -n "INV-22 (no secrets)... "
ENV_FILES=$(git ls-files | grep -E '^\.env' || true)
TOKEN_REFS=$(grep -rn 'NEXUS_BEARER_TOKEN' --include="*.ts" --include="*.json" packages/ supabase/ \
  | grep -v node_modules | grep -v __tests__ || true)
if [ -n "$ENV_FILES" ] || [ -n "$TOKEN_REFS" ]; then
  [ -n "$ENV_FILES" ] && echo "FAIL: .env files in git: $ENV_FILES"
  [ -n "$TOKEN_REFS" ] && echo "FAIL: NEXUS_BEARER_TOKEN references: $TOKEN_REFS"
  FAIL=1
else
  echo "ok"
fi

echo ""
if [ "$FAIL" -ne 0 ]; then
  echo "INVARIANT CHECK FAILED"
  exit 1
fi
echo "ALL INVARIANT CHECKS PASSED"
