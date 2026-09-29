#!/usr/bin/env bash
# Pre-commit hook: ensures new migration numbers are higher than the highest existing one.
set -euo pipefail

MIGRATION_DIR="supabase/migrations"

if [[ ! -d "$MIGRATION_DIR" ]]; then
  exit 0
fi

STAGED_MIGRATIONS=$(git diff --cached --name-only -- "$MIGRATION_DIR/" | grep -E '^supabase/migrations/[0-9]+' || true)

if [[ -z "$STAGED_MIGRATIONS" ]]; then
  exit 0
fi

HIGHEST_COMMITTED=$(git ls-tree -r --name-only HEAD -- "$MIGRATION_DIR/" 2>/dev/null | xargs -I{} basename {} | grep -oE '^[0-9]+' | sort -n | tail -1)
HIGHEST_COMMITTED=${HIGHEST_COMMITTED:-0}

while IFS= read -r mig; do
  [[ -z "$mig" ]] && continue
  NUM=$(basename "$mig" | grep -oE '^[0-9]+')
  if [[ "$NUM" -le "$HIGHEST_COMMITTED" ]]; then
    echo "✘ migration-check: Migration $NUM ($(basename "$mig")) is not higher than existing highest ($HIGHEST_COMMITTED)."
    echo "Use number $((HIGHEST_COMMITTED + 1)) or higher."
    exit 1
  fi
done <<< "$STAGED_MIGRATIONS"

exit 0
