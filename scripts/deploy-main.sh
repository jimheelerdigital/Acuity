#!/usr/bin/env bash
#
# deploy-main.sh — ship main to Production the safe way: a *guarded* push.
#
# ── How prod deploys work now (verified 2026-09-23) ──────────────────
# Vercel's GitHub integration is connected (jimheelerdigital/Acuity,
# reconnected 2026-04-21) with Production Branch = main. A push to main
# triggers a Production build FROM GITHUB; a PR push builds a Preview.
# Confirmed live: a PR push built a Preview and main pushes build prod.
#
# This retires the old workaround. Between 2026-04-20 and now this script
# ended with `vercel --prod`, which deploys the ON-DISK working tree —
# NOT what's on GitHub. Running that from a checkout that was behind
# origin/main (or had uncommitted edits) overwrote prod with stale code:
# that is the clobber Keenan hit. We no longer deploy from local disk.
#
# THE RULE: deploy by getting code onto main (push, or merge a PR). Never
# run `vercel --prod` from a local checkout for a routine deploy — it
# bypasses Git and can clobber newer work. Reserve the Vercel CLI /
# dashboard "Promote" for an intentional emergency rollback only.
#
# Usage:
#   ./scripts/deploy-main.sh            # guarded push of main (Vercel builds)
#   ./scripts/deploy-main.sh --dry-run  # show what would happen
#
# Prereqs: current branch is main; tree clean; up to date with origin/main.

set -euo pipefail

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
fi

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Guard 1: current branch must be main.
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "main" ]]; then
  echo "❌ Current branch is '$BRANCH', not 'main'. Refusing to deploy." >&2
  echo "   This script only deploys main — check out main first, or open" >&2
  echo "   a PR and merge it (PRs build a Vercel Preview automatically)." >&2
  exit 1
fi

# Guard 2: working tree must be CLEAN (now blocks, was warn-only).
# Only committed code should reach main/prod; a clean tree is the honest
# signal that what you're pushing is exactly what you've committed.
if [[ -n "$(git status --porcelain)" ]]; then
  echo "❌ Working tree has uncommitted changes. Commit or stash first —" >&2
  echo "   only committed code should reach main/prod." >&2
  exit 1
fi

# Guard 3: must be up to date with origin/main (never deploy stale).
git fetch origin main --quiet
BEHIND="$(git rev-list --count main..origin/main)"
if [[ "$BEHIND" -gt 0 ]]; then
  echo "❌ Local main is $BEHIND commit(s) behind origin/main." >&2
  echo "   Pull first so you don't ship a stale tree:" >&2
  echo "     git pull --ff-only origin main" >&2
  exit 1
fi

AHEAD="$(git rev-list --count origin/main..main)"

echo "──────────────────────────────────────────────"
echo " Deploy Plan (Git-triggered — Vercel builds from GitHub)"
echo "──────────────────────────────────────────────"
echo " Branch:          main"
echo " Commits ahead:   $AHEAD (will push to origin/main)"
echo " Working tree:    clean"
echo " Vercel project:  acuity-web (heelerdigital) — auto-deploys main"
echo "──────────────────────────────────────────────"

if [[ "$AHEAD" -eq 0 ]]; then
  echo "ℹ️  Nothing to push — origin/main already matches. Prod is current."
  exit 0
fi

if [[ "$DRY_RUN" == "1" ]]; then
  echo " [DRY RUN] Would run: git push origin main"
  echo "           (Vercel then builds Production from the new commit.)"
  exit 0
fi

echo ""
echo "▶️  Pushing to origin/main (Vercel will build Production)…"
git push origin main

echo ""
echo "✅ Pushed. Vercel is building Production from GitHub now."
echo "   Watch:  https://vercel.com/heelerdigital/acuity-web/deployments"
echo "   or:     vercel ls --prod"
echo ""
echo "   Do NOT run 'vercel --prod' to 'make it live' — the push already"
echo "   did. That command deploys your local disk and can clobber prod."
