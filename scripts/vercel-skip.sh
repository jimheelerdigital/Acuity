#!/usr/bin/env bash
# Vercel "Ignored Build Step" — skip a build when the diff vs the last
# successful deploy only touches files that don't affect the web bundle.
#
# How Vercel calls this:
#   - exit 0 → SKIP the build
#   - exit 1 → RUN the build
#
# Excludes (paths the script considers irrelevant for a web rebuild):
#   *.md           — root markdown (AUDIT.md, CREDENTIAL_LEAK_AUDIT.md, etc.)
#   PROGRESS.md    — explicit (already covered by *.md but kept for clarity)
#   docs/**        — entire docs subtree
#   apps/mobile/** — Expo app, has its own EAS pipeline
#   .github/**     — GitHub Actions configs, don't ship to Vercel
#   scripts/**     — local-only / one-shot scripts (this file lives here too)
#   **.lock        — package-lock.json etc. — handled by install step, not bundle
#
# If you need to FORCE a build despite the diff being doc-only (e.g. to
# pick up an env var change), push an empty commit:
#   git commit --allow-empty -m "chore: force vercel rebuild"
#
# Verified locally with five test cases (root .md, docs/**, web change,
# PROGRESS.md, apps/mobile/**) — see commit message of the introducing
# change for the test transcript.

set -euo pipefail

# Vercel exposes the previous successful deploy's SHA in this env var.
# Fall back to HEAD^ if it's missing (first deploy or local invocation),
# which compares against the previous commit — same intent.
PREV_SHA="${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}"

# `git diff --quiet` exits 0 if there's NO diff (after applying the
# excludes), 1 if there IS a relevant diff. That matches Vercel's
# "exit 0 = skip" convention exactly — no inversion needed.
git diff --quiet "$PREV_SHA" HEAD -- \
  ':!*.md' \
  ':!PROGRESS.md' \
  ':!docs/**' \
  ':!apps/mobile/**' \
  ':!.github/**' \
  ':!scripts/**' \
  ':!**.lock'
