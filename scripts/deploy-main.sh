#!/usr/bin/env bash
#
# deploy-main.sh — push main + trigger a Production deploy on Vercel.
#
# Temporary workaround for 2026-04-20 finding: Vercel's GitHub
# auto-deploy webhook has not been firing for this project (suspected
# webhook-delivery breakage after the repo transfer from keypicksem →
# jimheelerdigital). Pushes to main land on GitHub but don't trigger
# Vercel Production builds. Until that's fixed, run this script
# instead of `git push origin main` when you want the push live.
#
# Usage:
#   ./scripts/deploy-main.sh            # clean-tree push + deploy
#   ./scripts/deploy-main.sh --dry-run  # show what would happen
#
# Prerequisites:
#   - Current branch must be `main` (otherwise the script refuses —
#     it won't silently push a non-main branch to main).
#   - `vercel` CLI installed and authenticated as a member of
#     keypicksems-projects (`vercel whoami`).
#   - Working tree should be clean; the script warns but doesn't block
#     on dirty trees — Vercel will build whatever's on disk, which
#     may diverge from what just got pushed to GitHub.
#
# Retire this script when Vercel auto-deploy is restored. The
# blocker diagnosis + recovery path is in PROGRESS.md under
# "Blocked on Inngest verification" (2026-04-20).

set -euo pipefail

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
fi

# Resolve repo root so the script works from any cwd.
REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Guard 1: current branch must be main.
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "main" ]]; then
  echo "❌ Current branch is '$BRANCH', not 'main'. Refusing to deploy." >&2
  echo "   This script only deploys main — check out main first." >&2
  exit 1
fi

# Guard 2: working tree clean (warn-only).
if [[ -n "$(git status --porcelain)" ]]; then
  echo "⚠️  Working tree has uncommitted changes. Vercel will build" >&2
  echo "    the on-disk state, which diverges from what'll be on" >&2
  echo "    GitHub after this push. Consider committing first." >&2
  echo "" >&2
fi

# Guard 3: ahead/behind origin/main.
git fetch origin main --quiet
BEHIND="$(git rev-list --count main..origin/main)"
if [[ "$BEHIND" -gt 0 ]]; then
  echo "❌ Local main is $BEHIND commit(s) behind origin/main." >&2
  echo "   Pull first: git pull --ff-only origin main" >&2
  exit 1
fi

AHEAD="$(git rev-list --count origin/main..main)"

echo "──────────────────────────────────────────────"
echo " Deploy Plan"
echo "──────────────────────────────────────────────"
echo " Branch:          main"
echo " Commits ahead:   $AHEAD (will push to origin/main)"
echo " Working tree:    $([[ -z "$(git status --porcelain)" ]] && echo 'clean' || echo 'DIRTY')"
echo " Vercel project:  acuity-web (keypicksems-projects)"
echo "──────────────────────────────────────────────"

if [[ "$DRY_RUN" == "1" ]]; then
  echo " [DRY RUN] Would run:"
  echo "   git push origin main"
  echo "   vercel --prod"
  exit 0
fi

echo ""
echo "▶️  Pushing to origin/main..."
git push origin main

echo ""
echo "▶️  Triggering Vercel Production deploy..."
echo "    (This returns as soon as the build is queued; watch progress"
echo "     in the Vercel dashboard or with \`vercel logs --prod\`.)"
echo ""
vercel --prod

echo ""
echo "✅ Done. Verify with:"
echo "   curl -sI https://www.getacuity.io/api/inngest"
echo "   (expect 503 with ENABLE_INNGEST_PIPELINE unset — NOT 404)"
