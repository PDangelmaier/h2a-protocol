#!/usr/bin/env bash
set -euo pipefail

# Secret-Scan for H2A (SPEC-037 AC-4, SPEC-051 AC-1)
# Scans staged files (pre-commit), all tracked files (CI), or runs self-test.

MODE="${1:-ci}"
FAIL=0

PATTERNS=(
  'sk-ant-[a-zA-Z0-9_]{20,}'
  'sk-proj-[a-zA-Z0-9_]{20,}'
  'sk-lf-[a-zA-Z0-9_]{20,}'
  'pk-lf-[a-zA-Z0-9_]{20,}'
  'sb_secret_[a-zA-Z0-9_]{20,}'
  'sk-[a-zA-Z0-9_]{20,}'
  'eyJ[a-zA-Z0-9_-]{40,}\.[a-zA-Z0-9_-]{40,}'
  'AKIA[0-9A-Z]{16}'
  'ghp_[a-zA-Z0-9]{36}'
  'xox[bpras]-[a-zA-Z0-9-]{10,}'
  'glpat-[a-zA-Z0-9_-]{20,}'
  'sb-[a-zA-Z0-9]{20,}'
  '-----BEGIN .*PRIVATE KEY-----'
  'Bearer [a-zA-Z0-9_.=-]{40,}'
)

EXCLUDE_PATHS="node_modules|\.git/|dist/|\.lock$|secret-scan\.sh|secret-scan-selftest"

if [ "$MODE" = "self-test" ]; then
  exec "$0" --self-test-internal
fi

if [ "$MODE" = "--self-test-internal" ]; then
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  FIXTURES_DIR="$SCRIPT_DIR/secret-scan-selftest"
  mkdir -p "$FIXTURES_DIR"

  SAMPLES=(
    "sk-ant-api03_ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ1234"
    "sk-lf-abcdefghijklmnopqrstuvwxyz"
    "pk-lf-abcdefghijklmnopqrstuvwxyz"
    "sb_secret_abcdefghijklmnopqrstuvwxyz"
    "sk-abcdefghijklmnopqrstuvwxyz1234"
    "AKIAIOSFODNN7EXAMPLE"
    "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij"
    "xoxb-1234567890-abcdefgh"
    "glpat-ABCDEFGHIJKLMNOPQRST"
    "-----BEGIN RSA PRIVATE KEY-----"
    "-----BEGIN PRIVATE KEY-----"
    "Bearer eyJhbGciOiJIUzI1NiJ9.abcdefghijklmnopqrstuvwxyz1234567890"
  )

  PASS=0
  TOTAL=${#SAMPLES[@]}

  for sample in "${SAMPLES[@]}"; do
    TMPFILE="$FIXTURES_DIR/test-$(echo "$sample" | md5sum | cut -c1-8).txt"
    echo "$sample" > "$TMPFILE"

    FOUND=0
    for pattern in "${PATTERNS[@]}"; do
      if grep -qE -e "$pattern" "$TMPFILE" 2>/dev/null; then
        FOUND=1
        break
      fi
    done

    if [ "$FOUND" -eq 1 ]; then
      PASS=$((PASS + 1))
    else
      echo "MISS: $sample"
    fi
  done

  SAFE_SAMPLES=(
    "This is safe text"
    "model-id: claude-sonnet-4-6"
    "const key = process.env.API_KEY"
    "NEXUS_ENDPOINT=https://api.example.com"
  )

  FP=0
  for safe in "${SAFE_SAMPLES[@]}"; do
    TMPFILE="$FIXTURES_DIR/safe-$(echo "$safe" | md5sum | cut -c1-8).txt"
    echo "$safe" > "$TMPFILE"

    for pattern in "${PATTERNS[@]}"; do
      if grep -qE -e "$pattern" "$TMPFILE" 2>/dev/null; then
        echo "FALSE POSITIVE: '$safe' matched by '$pattern'"
        FP=$((FP + 1))
        break
      fi
    done
  done

  rm -rf "$FIXTURES_DIR"

  echo "Self-test: $PASS/$TOTAL detected, $FP false positives"
  if [ "$PASS" -lt "$TOTAL" ] || [ "$FP" -gt 0 ]; then
    echo "FAIL: Secret-scan self-test"
    exit 1
  fi
  echo "Secret-Scan self-test: PASSED"
  exit 0
fi

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
  MATCHES=$(echo "$FILES" | grep -vE "$EXCLUDE_PATHS" | xargs grep -lnE -e "$pattern" 2>/dev/null || true)
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
