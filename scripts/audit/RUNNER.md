# Weekly audit — run instructions (mechanics only)

This block is prepended by `scripts/audit/run-audit.sh`. The audit itself is
defined in `audits/WEEKLY_AUDIT_PROMPT.md`, which follows below. If the two
ever conflict on WHAT to audit, the audit prompt wins. This file only covers
where things are and what to write.

## This run
- Reporting week ends: **{{DATE}}** (Sunday 00:00 → Saturday 23:59, America/Chicago).
- This week's metrics: `audits/data/{{DATE}}.json`. Read it fully. `period`,
  `sources_status`, `derived` and `blind_spots` explain what is and isn't there.
  `supabase.weekly_series[0]` is this week and `[1..4]` are the 4 prior weeks,
  so the 4-week trend is available even when past data files are missing.
- Past weeks: `audits/data/*.json`, weekly reports `audits/YYYY-MM-DD.md`, and
  `audits/recommendations-log.md`, restored from the `audits` branch. On the
  first run none of these exist. Say so in section 4 and start the log.
  (`audits/2026-04-23_mobile_web_parity.md` is an older one-off audit, not a weekly report.)
- What shipped: `git log` is available (read-only), and `PROGRESS.md` is the changelog.

## Hard constraints
- **Read-only.** Do not create, edit, or delete any file except the three outputs
  below. Do not run git commands that write (commit, push, checkout, reset, stash).
- Do not open `.env*` files or print secret values. Env var NAMES come from
  `.env.example`, `turbo.json`, and code that reads `process.env`.
- The data file is already anonymized. Keep it that way: no user ids, emails, or
  names, and no quoted entry text. Public app-store review text is fine
  without reviewer names.
- **Customer-facing copy you write** (TikTok hooks, ASO title/subtitle/keywords,
  ad lines) must follow `docs/acuity-positioning.md`. That means no "brain dump",
  no fixed time of day ("nightly", "before bed"), no recording-duration claims,
  and current pricing. If the audit prompt's own wording conflicts with that
  doc, follow the doc for copy and note the conflict once in the Backlog.
- Budget: finish in about 30 minutes of work. Prefer fewer, sharper web
  searches (about 40 max). Always search for pricing, competitors, and "last 30
  days" items. Never answer those from memory.

## Outputs (exactly these three files)
1. `audits/out/report.md`: the full report. The first line must be
   `# Ripple Weekly Audit — {{DATE}}`. After it come sections 1–15 exactly as the
   audit prompt defines them, as markdown. Tables must be GitHub-flavoured
   markdown tables. It will be emailed and read on a phone, so keep
   tables to 5 columns or fewer and paragraphs short.
2. `audits/out/recommendations-log.md`: the COMPLETE updated log, not a diff.
   Start from the existing `audits/recommendations-log.md` if present and keep
   every past row. Update status/result from evidence (git log, PROGRESS.md,
   metrics). Add this week's priority recommendations and backlog items. Format:

   ```
   # Recommendations log

   | ID | Date | Recommendation | Impact/Effort | Status | Result |
   |---|---|---|---|---|---|
   | R-{{DATE}}-1 | {{DATE}} | … | H / 4h | open | — |
   ```
   Status is one of: open, done, ignored, killed.
3. `audits/out/big-move.txt`: one line only. It holds the One Big Move in
   **fewer than 8 words**, plain text, no quotes or trailing period. It becomes the email subject.

Write all three files before you finish, even if some data is missing. A
report that names its blind spots beats no report.
