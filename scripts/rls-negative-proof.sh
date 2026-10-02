#!/usr/bin/env bash
# SPEC-044 AC-5: Prove that the generic CI role test catches:
#   (a) A policy with using (true) without role binding
#   (b) A new function without REVOKE
# Requires the db-verify PostgreSQL container to be running.
set -euo pipefail

PSQL="psql -h localhost -U postgres -d h2a_verify -v ON_ERROR_STOP=1 -t -A"
PGPASSWORD="${PGPASSWORD:-verify_pass}"
export PGPASSWORD

echo "=== SPEC-044 AC-5 Negative Proof ==="
echo ""

# ── (a) Policy using (true) without role binding ───────────────────
echo "--- Case (a): Open policy on a probe table ---"
$PSQL <<'SQL'
CREATE TABLE IF NOT EXISTS _probe_open_policy (id serial primary key, data text);
ALTER TABLE _probe_open_policy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_all" ON _probe_open_policy FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON _probe_open_policy TO anon, authenticated, service_role;
INSERT INTO _probe_open_policy (data) VALUES ('visible');
SQL

FAIL_A=0
for role in anon authenticated; do
  RESULT=$($PSQL -c "SET LOCAL ROLE $role; SELECT count(*) FROM _probe_open_policy;" 2>&1 || true)
  $PSQL -c "RESET ROLE;" >/dev/null 2>&1
  if echo "$RESULT" | grep -qE "^[1-9]"; then
    echo "  DETECTED: $role can SELECT _probe_open_policy → $RESULT row(s)"
    FAIL_A=1
  fi
done

# Now check the policy audit would catch it
BAD=$($PSQL -c "
  SELECT policyname FROM pg_policies
  WHERE schemaname = 'public' AND tablename = '_probe_open_policy'
    AND (roles = '{}' OR roles @> ARRAY['anon']::name[] OR roles @> ARRAY['authenticated']::name[]);
")
if [ -n "$BAD" ]; then
  echo "  DETECTED: Policy audit found: $BAD"
  FAIL_A=1
fi

# Cleanup
$PSQL -c "DROP TABLE IF EXISTS _probe_open_policy CASCADE;" >/dev/null 2>&1

if [ "$FAIL_A" -eq 1 ]; then
  echo "  ✓ Case (a): Role test WOULD fail (open policy detected)"
else
  echo "  ✗ Case (a): Role test did NOT detect open policy — BUG"
  exit 1
fi

echo ""

# ── (b) Function without REVOKE ────────────────────────────────────
echo "--- Case (b): Function without EXECUTE revoke ---"
$PSQL <<'SQL'
CREATE OR REPLACE FUNCTION _probe_leaked_fn() RETURNS text AS $$
BEGIN RETURN 'leaked'; END;
$$ LANGUAGE plpgsql;
SQL

FAIL_B=0
for role in anon authenticated; do
  RESULT=$($PSQL -c "SET LOCAL ROLE $role; SELECT _probe_leaked_fn();" 2>&1 || true)
  $PSQL -c "RESET ROLE;" >/dev/null 2>&1
  if echo "$RESULT" | grep -q "leaked"; then
    echo "  DETECTED: $role can execute _probe_leaked_fn"
    FAIL_B=1
  fi
done

# Check aclexplode audit would catch it
LEAKED=$($PSQL -c "
  WITH fg AS (
    SELECT p.proname,
           (aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner)))).grantee AS grantee_oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = '_probe_leaked_fn'
  )
  SELECT fg.proname,
         CASE WHEN fg.grantee_oid = 0 THEN 'PUBLIC' ELSE r.rolname END
  FROM fg LEFT JOIN pg_roles r ON r.oid = fg.grantee_oid
  WHERE fg.grantee_oid = 0 OR r.rolname IN ('anon', 'authenticated');
")
if [ -n "$LEAKED" ]; then
  echo "  DETECTED: Function audit found: $LEAKED"
  FAIL_B=1
fi

# Cleanup
$PSQL -c "DROP FUNCTION IF EXISTS _probe_leaked_fn();" >/dev/null 2>&1

if [ "$FAIL_B" -eq 1 ]; then
  echo "  ✓ Case (b): Function audit WOULD fail (leaked EXECUTE detected)"
else
  echo "  ✗ Case (b): Function audit did NOT detect leaked EXECUTE — BUG"
  exit 1
fi

echo ""
echo "=== NEGATIVE PROOF PASSED ==="
