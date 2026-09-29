#!/usr/bin/env bash
# Tests for H2A process hooks (scope-check, migration-check, ac-check).
# Run from repo root: bash .claude/hooks/tests/test-hooks.sh
set -euo pipefail

PASS=0
FAIL=0
TESTS=0

assert_exit() {
  local name="$1" expected="$2" actual="$3"
  TESTS=$((TESTS + 1))
  if [[ "$actual" -eq "$expected" ]]; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

# --- migration-check tests ---
echo "migration-check:"

TESTREPO="$TMPDIR/migration-repo"
mkdir -p "$TESTREPO/supabase/migrations"
cd "$TESTREPO"
git init -q
touch supabase/migrations/019_model_config.sql
touch supabase/migrations/020_seeds.sql
git add -A && git commit -q -m "init"
cp "$OLDPWD/.claude/hooks/migration-check.sh" .

# Positive: new migration 021 should pass
touch supabase/migrations/021_new.sql
git add supabase/migrations/021_new.sql
bash migration-check.sh 2>/dev/null; assert_exit "021 > 020 passes" 0 $?
git reset -q HEAD -- supabase/migrations/021_new.sql
rm supabase/migrations/021_new.sql

# Negative: new migration 015 should fail
touch supabase/migrations/015_bad.sql
git add supabase/migrations/015_bad.sql
rc=0; bash migration-check.sh >/dev/null 2>&1 || rc=$?; assert_exit "015 < 020 fails" 1 $rc
git reset -q HEAD -- supabase/migrations/015_bad.sql
rm supabase/migrations/015_bad.sql

cd "$OLDPWD"

# --- ac-check tests ---
echo "ac-check:"

AC_TMPDIR="$TMPDIR/ac-test"
mkdir -p "$AC_TMPDIR/journal" "$AC_TMPDIR/specs"

# Create a spec with 3 AC
cat > "$AC_TMPDIR/specs/SPEC-099-test.md" << 'SPECEOF'
---
id: SPEC-099
acceptance_criteria:
  - "AC-1: First criterion"
  - "AC-2: Second criterion"
  - "AC-3: Third criterion"
---
SPECEOF

# Positive: journal covers all AC
cat > "$AC_TMPDIR/journal/SPEC-099.md" << 'JEOF'
---
spec: SPEC-099
status: REVIEW
---
## AC-Nachweis
| AC-1 | First | test_first | ✅ |
| AC-2 | Second | test_second | ✅ |
| AC-3 | Third | test_third | ✅ |
JEOF

# Override DRIVE_BASE for test
ORIG_SCRIPT=$(cat .claude/hooks/ac-check.sh)
TEST_SCRIPT=$(echo "$ORIG_SCRIPT" | sed "s|DRIVE_BASE=.*|DRIVE_BASE=\"$AC_TMPDIR\"|" | sed "s|JOURNAL_DIR=.*|JOURNAL_DIR=\"$AC_TMPDIR/journal\"|" | sed "s|SPECS_DIR=.*|SPECS_DIR=\"$AC_TMPDIR/specs\"|")
echo "$TEST_SCRIPT" > "$TMPDIR/ac-check-test.sh"
chmod +x "$TMPDIR/ac-check-test.sh"

bash "$TMPDIR/ac-check-test.sh" 2>/dev/null; assert_exit "all AC covered passes" 0 $?

# Negative: journal missing AC-3
cat > "$AC_TMPDIR/journal/SPEC-099.md" << 'JEOF'
---
spec: SPEC-099
status: IN_PROGRESS
---
## AC-Nachweis
| AC-1 | First | test_first | ✅ |
| AC-2 | Second | test_second | ✅ |
JEOF

rc=0; bash "$TMPDIR/ac-check-test.sh" >/dev/null 2>&1 || rc=$?; assert_exit "missing AC-3 fails" 1 $rc

# --- scope-check tests ---
echo "scope-check:"

SCOPE_REPO="$TMPDIR/scope-repo"
mkdir -p "$SCOPE_REPO/packages/mb-agent/src" "$SCOPE_REPO/packages/core/src"
cd "$SCOPE_REPO"
git init -q
touch packages/mb-agent/src/main.ts packages/core/src/other.ts
git add -A && git commit -q -m "init"

# Create mock Drive structure for scope-check
MOCK_DRIVE="$TMPDIR/scope-drive"
mkdir -p "$MOCK_DRIVE/journal" "$MOCK_DRIVE/specs"

cat > "$MOCK_DRIVE/journal/SPEC-100.md" << 'JEOF'
---
spec: SPEC-100
status: IN_PROGRESS
---
JEOF

cat > "$MOCK_DRIVE/specs/SPEC-100-test.md" << 'SPECEOF'
---
id: SPEC-100
scope_paths:
  - "packages/mb-agent/"
---
SPECEOF

SCOPE_SCRIPT=$(cat "$OLDPWD/.claude/hooks/scope-check.sh" | sed "s|DRIVE_BASE=.*|DRIVE_BASE=\"$MOCK_DRIVE\"|" | sed "s|JOURNAL_DIR=.*|JOURNAL_DIR=\"$MOCK_DRIVE/journal\"|")
echo "$SCOPE_SCRIPT" > "$TMPDIR/scope-check-test.sh"
chmod +x "$TMPDIR/scope-check-test.sh"

# Positive: file in scope
echo "change" >> packages/mb-agent/src/main.ts
git add packages/mb-agent/src/main.ts
bash "$TMPDIR/scope-check-test.sh" 2>/dev/null; assert_exit "in-scope file passes" 0 $?
git reset -q HEAD -- packages/mb-agent/src/main.ts
git checkout -q -- packages/mb-agent/src/main.ts

# Negative: file out of scope
echo "change" >> packages/core/src/other.ts
git add packages/core/src/other.ts
rc=0; bash "$TMPDIR/scope-check-test.sh" >/dev/null 2>&1 || rc=$?; assert_exit "out-of-scope file fails" 1 $rc

cd "$OLDPWD"

echo ""
echo "Results: $PASS/$TESTS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]]
