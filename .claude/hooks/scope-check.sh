#!/usr/bin/env bash
# Pre-commit hook: checks staged files against active spec's scope_paths.
# Files outside scope_paths require an "Abweichungen" entry in the journal.
set -euo pipefail

DRIVE_BASE="$HOME/Library/CloudStorage/GoogleDrive-"*"/Meine Ablage/Claude-Sync/h2a"
JOURNAL_DIR=$(echo $DRIVE_BASE/journal)

ACTIVE_SPEC=""
for f in "$JOURNAL_DIR"/SPEC-*.md; do
  [ -f "$f" ] || continue
  status=$(grep -m1 '^status:' "$f" | sed 's/status: *//')
  if [[ "$status" == "IN_PROGRESS" ]]; then
    ACTIVE_SPEC="$f"
    break
  fi
done

if [[ -z "$ACTIVE_SPEC" ]]; then
  exit 0
fi

SPEC_ID=$(grep -m1 '^spec:' "$ACTIVE_SPEC" | sed 's/spec: *//')
SPEC_FILE=$(echo $DRIVE_BASE/specs/${SPEC_ID}*.md)

if [[ ! -f "$SPEC_FILE" ]]; then
  exit 0
fi

SCOPE_PATHS=$(grep -A50 '^scope_paths:' "$SPEC_FILE" | grep '^ *- ' | sed 's/^ *- *"\{0,1\}//;s/"\{0,1\} *$//' | head -20)

if [[ -z "$SCOPE_PATHS" ]]; then
  exit 0
fi

STAGED=$(git diff --cached --name-only)
OUT_OF_SCOPE=""

while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  IN_SCOPE=false
  while IFS= read -r sp; do
    [[ -z "$sp" ]] && continue
    if [[ "$file" == $sp* ]]; then
      IN_SCOPE=true
      break
    fi
  done <<< "$SCOPE_PATHS"
  if [[ "$IN_SCOPE" == false ]]; then
    OUT_OF_SCOPE="$OUT_OF_SCOPE\n  $file"
  fi
done <<< "$STAGED"

if [[ -n "$OUT_OF_SCOPE" ]]; then
  echo "⚠ scope-check: Files outside ${SPEC_ID} scope_paths:${OUT_OF_SCOPE}"
  echo "Add these to 'Abweichungen' in journal/${SPEC_ID}.md or remove from commit."
  exit 1
fi

exit 0
