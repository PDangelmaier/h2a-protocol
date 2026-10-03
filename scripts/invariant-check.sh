#!/usr/bin/env bash
set -euo pipefail

# Automated invariant checks (SPEC-040 AC-2, SPEC-051 AC-2)
# Checks all statically verifiable invariants from Anhang E.

MODE="${1:-ci}"
FAIL=0

check() {
  local id="$1" desc="$2"
  echo -n "$id ($desc)... "
}

fail() {
  echo "FAIL: $1"
  FAIL=$((FAIL + 1))
}

ok() { echo "ok"; }

echo "=== Invariant Check ==="

check "INV-01" "no Messages API"
if grep -rn --include="*.ts" -E '(anthropic\.messages|/v1/messages)' packages/ supabase/ \
  | grep -v node_modules | grep -v __tests__ | grep -v '.d.ts' | grep -v '/e2e/'; then
  fail "Messages API references found"
else
  ok
fi

check "INV-02" "no Bedrock-native model IDs"
if grep -rn --include="*.ts" 'anthropic\.claude' packages/ supabase/ \
  | grep -v node_modules | grep -v __tests__ | grep -v '.d.ts' | grep -v '/e2e/'; then
  fail "Bedrock-native model IDs found"
else
  ok
fi

check "INV-03" "no model ID literals in production code"
if grep -rn --include="*.ts" -E "'claude-[a-z]+-[0-9]" packages/ supabase/ \
  | grep -v node_modules | grep -v __tests__ | grep -v '.d.ts' \
  | grep -v 'migrations/' | grep -v 'seeds/' | grep -v '/e2e/'; then
  fail "Model ID literals in production code"
else
  ok
fi

check "INV-11" "handleRequest exported from index.ts"
if ! grep -q "export.*handleRequest" packages/mb-agent/src/index.ts 2>/dev/null; then
  fail "handleRequest not exported from packages/mb-agent/src/index.ts"
else
  ok
fi

check "INV-11b" "setAdminVerifier not publicly exported"
if grep -q "export.*setAdminVerifier" packages/mb-agent/src/index.ts 2>/dev/null; then
  fail "setAdminVerifier must not be publicly exported (security)"
else
  ok
fi

check "INV-22" "no secrets committed"
ENV_FILES=$(git ls-files | grep -E '^\.env' || true)
TOKEN_REFS=$(grep -rn 'NEXUS_BEARER_TOKEN' --include="*.ts" --include="*.json" packages/ supabase/ \
  | grep -v node_modules | grep -v __tests__ || true)
if [ -n "$ENV_FILES" ] || [ -n "$TOKEN_REFS" ]; then
  [ -n "$ENV_FILES" ] && fail ".env files in git: $ENV_FILES"
  [ -n "$TOKEN_REFS" ] && fail "NEXUS_BEARER_TOKEN references: $TOKEN_REFS"
else
  ok
fi

check "INV-24" "consent types consistent"
TS_COUNT=$(grep -c "'" packages/mb-agent/src/enterprise-types.ts 2>/dev/null \
  | head -1 || echo 0)
if [ "$TS_COUNT" -lt 10 ]; then
  fail "enterprise-types.ts has fewer than 10 consent type strings"
else
  ok
fi

check "INV-RLS" "all CREATE TABLE have ENABLE ROW LEVEL SECURITY"
TABLES_WITHOUT_RLS=0
for tbl_file in $(grep -l 'CREATE TABLE' supabase/migrations/*.sql 2>/dev/null); do
  TABLES=$(grep -oP 'CREATE TABLE (?:IF NOT EXISTS )?\K\w+' "$tbl_file" 2>/dev/null || true)
  for tbl in $TABLES; do
    if ! grep -rq "ALTER TABLE $tbl ENABLE ROW LEVEL SECURITY" supabase/migrations/*.sql 2>/dev/null; then
      echo "  missing RLS: $tbl (from $tbl_file)"
      TABLES_WITHOUT_RLS=$((TABLES_WITHOUT_RLS + 1))
    fi
  done
done
if [ "$TABLES_WITHOUT_RLS" -gt 0 ]; then
  fail "$TABLES_WITHOUT_RLS table(s) without RLS"
else
  ok
fi

check "INV-RLS-ROLE" "latest RLS policies use TO service_role"
BAD_LATEST=0
for tbl in $(grep -ohP 'CREATE POLICY.*ON \K\w+' supabase/migrations/*.sql 2>/dev/null | sort -u); do
  LATEST_FILE=$(grep -l "CREATE POLICY.*ON $tbl" supabase/migrations/*.sql 2>/dev/null | sort | tail -1)
  if [ -n "$LATEST_FILE" ]; then
    LATEST_POLICY=$(grep -A2 "CREATE POLICY.*ON $tbl" "$LATEST_FILE" | tr '\n' ' ')
    if echo "$LATEST_POLICY" | grep -q 'TO service_role'; then
      continue
    fi
    echo "  $tbl ($LATEST_FILE): policy missing TO service_role"
    BAD_LATEST=$((BAD_LATEST + 1))
  fi
done
if [ "$BAD_LATEST" -gt 0 ]; then
  fail "$BAD_LATEST table(s) with incorrect latest RLS policy"
else
  ok
fi

check "INV-REVOKE" "default privileges revoke anon/authenticated on functions"
if ! grep -rq 'ALTER DEFAULT PRIVILEGES.*REVOKE EXECUTE.*FROM anon' supabase/migrations/*.sql 2>/dev/null; then
  fail "Missing ALTER DEFAULT PRIVILEGES REVOKE for functions"
else
  ok
fi

check "INV-MIGRATION-SEQ" "migration numbers are sequential"
PREV=0
SEQ_OK=1
for f in $(ls supabase/migrations/*.sql 2>/dev/null | sort); do
  NUM=$(basename "$f" | grep -oE '^[0-9]+' || echo 0)
  NUM=$((10#$NUM))
  if [ "$PREV" -gt 0 ] && [ "$NUM" -ne $((PREV + 1)) ]; then
    echo "  gap: $PREV → $NUM"
    SEQ_OK=0
  fi
  PREV=$NUM
done
if [ "$SEQ_OK" -eq 0 ]; then
  fail "Migration number gap detected"
else
  ok
fi

echo ""
if [ "$FAIL" -ne 0 ]; then
  echo "INVARIANT CHECK FAILED ($FAIL issue(s))"
  exit 1
fi
echo "ALL INVARIANT CHECKS PASSED (10 checks)"
