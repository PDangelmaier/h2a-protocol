#!/usr/bin/env bash
# Pre-commit hook: blocks direct (non-merge) commits on main.
# REVIEW-012 P2: only merge commits allowed on main.
set -euo pipefail

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
[[ "$BRANCH" != "main" ]] && exit 0

if ! git rev-parse MERGE_HEAD >/dev/null 2>&1; then
  echo "✘ main-guard: Direct commits on main are not allowed."
  echo "  Create a feature branch and merge via PR/review."
  exit 1
fi
