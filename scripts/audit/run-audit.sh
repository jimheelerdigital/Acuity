#!/usr/bin/env bash
# Runs the weekly audit with Claude Code headless (`claude -p`).
# Used by .github/workflows/weekly-audit.yml and for local test runs.
#
# Inputs:  audits/data/LATEST (written by collect-metrics.ts), audits/WEEKLY_AUDIT_PROMPT.md
# Outputs: audits/out/{report.md, recommendations-log.md, big-move.txt, claude-result.json, claude-stderr.log}
# Env:     ANTHROPIC_API_KEY (CI; locally the logged-in CLI is used), AUDIT_MODEL,
#          AUDIT_TIMEOUT (default 38m — leaves headroom in the 45-min job)
set -uo pipefail
cd "$(dirname "$0")/../.."

DATE="$(cat audits/data/LATEST 2>/dev/null || true)"
if [[ -z "$DATE" ]]; then
  echo "audits/data/LATEST missing — collector did not run" >&2
  exit 1
fi
MODEL="${AUDIT_MODEL:-claude-fable-5-1}"
OUT=audits/out
mkdir -p "$OUT"
rm -f "$OUT"/report.md "$OUT"/big-move.txt

PROMPT="$OUT/.prompt.md"
sed "s/{{DATE}}/$DATE/g" scripts/audit/RUNNER.md > "$PROMPT"
printf '\n\n---\n\n' >> "$PROMPT"
cat audits/WEEKLY_AUDIT_PROMPT.md >> "$PROMPT"

# Tool allowlist = the read-only contract. Anything not listed is denied in
# -p mode (no one is there to approve it). Write/Edit are needed for the three
# output files; in CI the job token is read-only and the publish job only
# picks up audits/out/*, so a stray write can never reach the repo.
ALLOWED="Read,Glob,Grep,WebSearch,WebFetch,Write,Edit,TodoWrite,Task,Agent"
ALLOWED+=",Bash(git log:*),Bash(git show:*),Bash(git diff:*),Bash(git ls-files:*),Bash(ls:*),Bash(wc:*),Bash(head:*),Bash(date:*)"

# GNU timeout on the runner; gtimeout (coreutils) or nothing on macOS.
TIMEOUT_CMD=()
if command -v timeout >/dev/null; then TIMEOUT_CMD=(timeout "${AUDIT_TIMEOUT:-38m}")
elif command -v gtimeout >/dev/null; then TIMEOUT_CMD=(gtimeout "${AUDIT_TIMEOUT:-38m}"); fi

echo "[audit] model=$MODEL date=$DATE"
${TIMEOUT_CMD[@]+"${TIMEOUT_CMD[@]}"} claude -p \
  --model "$MODEL" \
  --allowedTools "$ALLOWED" \
  --disallowedTools "Bash(git push:*),Bash(git commit:*),Bash(git checkout:*),Bash(git reset:*),Bash(rm:*)" \
  --permission-mode acceptEdits \
  --output-format json \
  < "$PROMPT" > "$OUT/claude-result.json" 2> "$OUT/claude-stderr.log"
STATUS=$?
echo "[audit] claude exit=$STATUS"

# Salvage: if Claude answered with the report as its final message instead of
# writing the file, keep that rather than failing the week.
if [[ ! -s "$OUT/report.md" ]] && [[ -s "$OUT/claude-result.json" ]]; then
  node -e '
    const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    if (typeof r.result === "string" && r.result.includes("## 1.")) {
      require("fs").writeFileSync(process.argv[2], r.result);
      console.log("[audit] salvaged report from final message");
    }' "$OUT/claude-result.json" "$OUT/report.md" || true
fi

if [[ -s "$OUT/report.md" ]] && grep -q "^## 1\." "$OUT/report.md"; then
  echo "[audit] report ok ($(wc -c < "$OUT/report.md") bytes)"
  exit 0
fi
echo "[audit] no usable report produced" >&2
exit 1
