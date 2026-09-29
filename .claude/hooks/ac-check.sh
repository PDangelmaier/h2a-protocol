#!/usr/bin/env bash
# Pre-push hook: verifies AC coverage between spec and journal evidence.
# Every AC-N in the spec must appear in journal/SPEC-NNN.md with a test name.
set -euo pipefail

DRIVE_BASE="$HOME/Library/CloudStorage/GoogleDrive-"*"/Meine Ablage/Claude-Sync/h2a"
JOURNAL_DIR=$(echo $DRIVE_BASE/journal)
SPECS_DIR=$(echo $DRIVE_BASE/specs)

BRANCH=$(git branch --show-current)
ERRORS=0

for journal_file in "$JOURNAL_DIR"/SPEC-*.md; do
  [ -f "$journal_file" ] || continue

  status=$(grep -m1 '^status:' "$journal_file" | sed 's/status: *//')
  [[ "$status" == "REVIEW" || "$status" == "IN_PROGRESS" ]] || continue

  spec_id=$(grep -m1 '^spec:' "$journal_file" | sed 's/spec: *//')
  spec_file=$(echo $SPECS_DIR/${spec_id}*.md)
  [[ -f "$spec_file" ]] || continue

  SPEC_ACS=$(grep -oE 'AC-[0-9]+' "$spec_file" 2>/dev/null | sort -u)
  if [[ -z "$SPEC_ACS" ]]; then
    SPEC_AC_COUNT=$(grep -c '^ *- ' <(sed -n '/^acceptance_criteria:/,/^[a-z]/p' "$spec_file") 2>/dev/null || echo "0")
    if [[ "$SPEC_AC_COUNT" -gt 0 ]]; then
      SPEC_ACS=$(seq 1 "$SPEC_AC_COUNT" | sed 's/^/AC-/')
    fi
  fi

  [[ -z "$SPEC_ACS" ]] && continue

  for ac in $SPEC_ACS; do
    if ! grep -q "$ac" "$journal_file"; then
      echo "✘ ac-check: $ac from $spec_id not found in $(basename "$journal_file")"
      ERRORS=$((ERRORS + 1))
    fi
  done
done

if [[ "$ERRORS" -gt 0 ]]; then
  echo "ac-check: $ERRORS AC(s) missing from journal evidence. Fix before push."
  exit 1
fi

exit 0
