#!/usr/bin/env bash
# Commits this week's audit to the `audits` branch — NEVER main.
#
#   audits/<date>.md               ← audits/out/report.md
#   audits/data/<date>.json        ← audits/data/<date>.json
#   audits/recommendations-log.md  ← audits/out/recommendations-log.md
#
# The branch is an orphan (no app code) created on first run. Works from a
# temporary worktree so the main checkout is never switched or modified.
# Env: AUDIT_REMOTE (default origin), AUDIT_NO_PUSH=1 to commit without pushing.
set -euo pipefail
cd "$(dirname "$0")/../.."

BRANCH=audits
REMOTE="${AUDIT_REMOTE:-origin}"
DATE="$(cat audits/data/LATEST)"
WORK="$(mktemp -d)"
trap 'git worktree remove --force "$WORK" >/dev/null 2>&1 || true' EXIT

if git ls-remote --exit-code --heads "$REMOTE" "$BRANCH" >/dev/null 2>&1; then
  git fetch --depth=50 "$REMOTE" "$BRANCH:refs/remotes/$REMOTE/$BRANCH"
  git worktree add -B "$BRANCH" "$WORK" "$REMOTE/$BRANCH"
else
  echo "[publish] creating orphan branch '$BRANCH'"
  # (portable: `worktree add --orphan` needs git ≥ 2.42)
  git worktree add --detach "$WORK" HEAD
  git -C "$WORK" checkout -q --orphan "$BRANCH"
  git -C "$WORK" rm -rf -q .
fi

mkdir -p "$WORK/audits/data"
copied=0
if [[ -s audits/out/report.md ]]; then cp audits/out/report.md "$WORK/audits/$DATE.md"; copied=1; fi
if [[ -s audits/out/recommendations-log.md ]]; then cp audits/out/recommendations-log.md "$WORK/audits/recommendations-log.md"; fi
if [[ -s "audits/data/$DATE.json" ]]; then cp "audits/data/$DATE.json" "$WORK/audits/data/$DATE.json"; copied=1; fi
if [[ $copied -eq 0 ]]; then echo "[publish] nothing to publish"; exit 0; fi
[[ -f "$WORK/README.md" ]] || printf '# Ripple weekly audits\n\nWritten by `.github/workflows/weekly-audit.yml` on main. Reports: `audits/YYYY-MM-DD.md`. Raw anonymized metrics: `audits/data/`. Running log: `audits/recommendations-log.md`.\n\nThis branch never merges into main.\n' > "$WORK/README.md"

cd "$WORK"
[[ "$(git symbolic-ref --short HEAD)" == "$BRANCH" ]] || { echo "refusing: worktree is not on $BRANCH" >&2; exit 1; }
git add -A -f .
if git diff --cached --quiet; then echo "[publish] no changes"; exit 0; fi
git -c user.name="ripple-audit-bot" -c user.email="audit-bot@users.noreply.github.com" \
  commit -q -m "audit: Weekly audit for week ending $DATE"
if [[ "${AUDIT_NO_PUSH:-0}" == "1" ]]; then
  echo "[publish] committed $(git rev-parse --short HEAD) on $BRANCH (push skipped)"
else
  git push "$REMOTE" "HEAD:refs/heads/$BRANCH"
  echo "[publish] pushed $(git rev-parse --short HEAD) to $REMOTE/$BRANCH"
fi
