#!/usr/bin/env bash
set -euo pipefail

# Secret-Scan for H2A (SPEC-037 AC-4)
# Scans staged files (pre-commit) or all tracked files (CI) for secret patterns.
# AUTO_LOG: Using grep-based patterns instead of external tool (no additional dependency).

MODE="${1:-ci}"
FAIL=0

PATTERNS=(
  'sk-[a-zA-Z0-9]{20,}'
  'eyJ[a-zA-Z0-9_-]{40,}\.[a-zA-Z0-9_-]{40,}'
  'AKIA[0-9A-Z]{16}'
  'ghp_[a-zA-Z0-9]{36}'
  'xox[bpras]-[a-zA-Z0-9-]{10,}'
  'glpat-[a-zA-Z0-9_-]{20,}'
  'sb-[a-zA-Z0-9]{20,}'
)

EXCLUDE_PATHS="node_modules|\.git/|dist/|\.lock$|secret-scan\.sh|\.test\.ts"

if [ "$MODE" = "pre-commit" ]; then
  FILES=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)
else
  FILES=$(git ls-files 2>/dev/null || true)
fi

if [ -z "$FILES" ]; then
  echo "Secret-Scan: no files to check"
  exit 0
fi

for pattern in "${PATTERNS[@]}"; do
  MATCHES=$(echo "$FILES" | grep -vE "$EXCLUDE_PATHS" | xargs grep -lnE "$pattern" 2>/dev/null || true)
  if [ -n "$MATCHES" ]; then
    echo "SECRET DETECTED (pattern: $pattern):"
    echo "$MATCHES" | while IFS= read -r file; do
      echo "  $file"
    done
    FAIL=$((FAIL + 1))
  fi
done

if [ "$FAIL" -gt 0 ]; then
  echo "FAIL: $FAIL secret pattern(s) found. Remove secrets before committing."
  exit 1
fi

echo "Secret-Scan: clean"
exit 0
