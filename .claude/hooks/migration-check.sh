#!/usr/bin/env bash
# Pre-commit hook: ensures new migration numbers are higher than the highest existing one
# and that migrations already on main are not modified or deleted (SPEC-041 AC-6).
set -euo pipefail

MIGRATION_DIR="supabase/migrations"

if [[ ! -d "$MIGRATION_DIR" ]]; then
  exit 0
fi

# Check for modified, deleted, or renamed migrations that exist on main.
# R (rename) shows old path in the output; D (delete) + M (modify) cover
# the rest. We only block files that exist on origin/main.
MODIFIED_MIGRATIONS=$(git diff --cached --diff-filter=MDR --name-only -- "$MIGRATION_DIR/" | while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  if git cat-file -e "origin/main:$f" 2>/dev/null; then
    echo "$f"
  fi
done || true)

if [[ -n "$MODIFIED_MIGRATIONS" ]]; then
  echo "✘ migration-check: Existing migrations must not be modified or deleted:"
  echo "$MODIFIED_MIGRATIONS" | while IFS= read -r m; do
    [[ -n "$m" ]] && echo "  ✘ $m"
  done
  echo "Add a new migration instead."
  exit 1
fi

# Check that new migrations have higher numbers
STAGED_MIGRATIONS=$(git diff --cached --diff-filter=A --name-only -- "$MIGRATION_DIR/" | grep -E '^supabase/migrations/[0-9]+' || true)

if [[ -z "$STAGED_MIGRATIONS" ]]; then
  exit 0
fi

HIGHEST_COMMITTED=$(git ls-tree -r --name-only HEAD -- "$MIGRATION_DIR/" 2>/dev/null | xargs -I{} basename {} | grep -oE '^[0-9]+' | sort -n | tail -1)
HIGHEST_COMMITTED=${HIGHEST_COMMITTED:-0}

while IFS= read -r mig; do
  [[ -z "$mig" ]] && continue
  NUM=$(basename "$mig" | grep -oE '^[0-9]+')
  if [[ 10#$NUM -le 10#$HIGHEST_COMMITTED ]]; then
    echo "✘ migration-check: Migration $NUM ($(basename "$mig")) is not higher than existing highest ($HIGHEST_COMMITTED)."
    echo "Use number $((HIGHEST_COMMITTED + 1)) or higher."
    exit 1
  fi
done <<< "$STAGED_MIGRATIONS"

exit 0
