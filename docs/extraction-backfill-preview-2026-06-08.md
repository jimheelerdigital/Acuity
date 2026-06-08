# Extraction Backfill — Preview (2026-06-08)

**Status: PREVIEW ONLY. No INSERT has run. Awaiting Jim's explicit row-level approval.**
Mechanism: `apps/web/scripts/backfill-extraction-commit.ts` (reuses `commitExtractedItems`, so backfilled rows are identical to the new auto-commit path). Default mode is dry-run; nothing writes without `--commit`.

## Scope (all-time)
Entries that are COMPLETE, have extracted task candidates in `rawAnalysis.tasks`, and have **zero** existing `Task` rows:

| Metric | Value |
|---|---|
| Affected entries | **75** |
| Affected users | **21** |
| Task rows to create | **179** |
| Goal candidates (deduped on write) | **61** |
| Date range | 2026-04-20 → 2026-06-08 |
| …in last 7 days | 38 entries |
| …in last 30 days | 64 entries |

Goal count is an upper bound — `commitExtractedItems` bumps existing goals (by case-insensitive title) instead of duplicating, so net new goals ≤ 61.

## Per-user counts (all 21)
| Email | Plan | Entries | Tasks | Goal cand. |
|---|---|---|---|---|
| midnightoilandtincture@gmail.com | TRIAL | 7 | 22 | 11 |
| cazdavies060@gmail.com | PRO | 12 | 22 | 1 |
| jim@heelerdigital.com | TRIAL | 9 | 20 | 4 |
| keenan@heelerdigital.com | TRIAL | 8 | 20 | 12 |
| programmingnyc@gmail.com | PRO | 8 | 19 | 11 |
| kaiberworks@gmail.com | PRO | 5 | 13 | 3 |
| erinkate826@gmail.com | TRIAL | 6 | 11 | 4 |
| stefanie@stefaniemullen.com | PRO | 4 | 10 | 1 |
| tomwebster@gmail.com | TRIAL | 1 | 6 | 2 |
| becky69clark@gmail.com | TRIAL | 1 | 6 | 0 |
| only1honeybrown@gmail.com | TRIAL | 3 | 5 | 2 |
| mostdaysnicole@gmail.com | TRIAL | 2 | 4 | 0 |
| heatherjackson0047@gmail.com | TRIAL | 1 | 4 | 2 |
| **thelmabowlen@gmail.com** (reported) | TRIAL | 1 | 4 | 2 |
| mreddit9095@gmail.com | TRIAL | 1 | 3 | 2 |
| emily101infante@gmail.com | TRIAL | 1 | 3 | 1 |
| mergler95@gmail.com | TRIAL | 1 | 3 | 3 |
| jim+slice2pro@heelerdigital.com | PRO | 1 | 1 | 0 |
| bachillerchasity@gmail.com | TRIAL | 1 | 1 | 0 |
| kitter1022@gmail.com | TRIAL | 1 | 1 | 0 |
| author.mpokocky@gmail.com | TRIAL | 1 | 1 | 0 |

(jim@, jim+slice2pro@, keenan@ are founder accounts — included; exclude them at run time if you prefer with a `--since`/email filter.)

## Sample preview — 5 users' actual extracted titles
> Real, sensitive personal content (housing, recovery, custody, health). Internal review only.

**thelmabowlen@gmail.com** — 2026-06-08 (the reported case)
- Tasks: *Request transcript from LaSalle · Get transcript verified through WES · Obtain marriage certificate · Update passport with married name* (4)
- Goals: 2 candidates

**cazdavies060@gmail.com** — 2026-06-03 → 06-08 (12 entries, 22 tasks). Samples:
- 06-03: *Shower and get ready before 10am client · Update the financial report · Read planned book · Finish session with Fiona on time · Review £5/month subscription value*
- 06-05: *Review personal spending accounts · Look up Trans Ally Rally date in London · Search for free events in Birmingham/Manchester/Liverpool this weekend* — Goal: *Build a consistent daily journaling and reflection practice*

**erinkate826@gmail.com** — 2026-05-21 → 06-04 (6 entries, 11 tasks). Samples:
- 05-25: *Go to the gym · Enjoy the clam bake in Newburyport · Set a work boundary for the evening* — Goals: *Manage anxiety and reduce panic episodes · Keep work stress from overtaking personal time*
- 05-31: *Schedule a talk with Jim about feeling overwhelmed · Prioritize work product launch to-do list · Follow up on house offer* — Goals: *Buy a new home with Jim · Get to a stable place with the medication change*

**midnightoilandtincture@gmail.com** — 2026-06-06 (7 entries, 22 tasks, 11 goals). Samples:
- *Research family law attorneys specializing in high-conflict custody · Find a therapist experienced in narcissistic abuse recovery · Start a smoking cessation plan* — Goals: *Reunite with and maintain a meaningful relationship with Layla and Isaiah · Quit smoking*
- *Book dental cleaning appointment · Research parasite cleanse protocol · Clean house — start with trash removal* — Goals: *Complete full dental restoration · Prepare home and self for life transition*

**programmingnyc@gmail.com** — 2026-05-31 (8 entries, 19 tasks, 11 goals). Samples:
- *Maintain daily rooftop walking meditation · Gradually increase daily steps toward 10,000 · Maintain marijuana cessation* — Goals: *Reach 10,000 steps per day · Rebuild physical fitness after cancer recovery*
- *Check in with recovery support system* — Goal: *Maintain lifelong sobriety and recovery*

## The exact mechanism

**Identify (read-only — confirms the 75):**
```sql
SELECT count(*) FROM "Entry" e
WHERE e.status='COMPLETE' AND e."rawAnalysis" IS NOT NULL
  AND jsonb_array_length(COALESCE(e."rawAnalysis"->'tasks','[]'::jsonb)) > 0
  AND NOT EXISTS (SELECT 1 FROM "Task" t WHERE t."entryId"=e.id);
```

**Write:** `apps/web/scripts/backfill-extraction-commit.ts` (this branch). It selects exactly that set, and for each entry — inside a per-entry transaction — re-checks "no Task rows", calls `commitExtractedItems(tx, userId, entryId, rawAnalysis.tasks, rawAnalysis.goals)`, and sets `extracted=true` (stamping `extractionCommittedAt` only if not already set). Run from a network that can reach Supabase (per CLAUDE.md, Jim's home network):
```
DATABASE_URL=<prod> npx tsx apps/web/scripts/backfill-extraction-commit.ts            # dry-run (prints counts)
DATABASE_URL=<prod> npx tsx apps/web/scripts/backfill-extraction-commit.ts --commit   # writes
# optional window: --since=2026-05-09
```

## Idempotency (safe to re-run)
- **Tasks:** the script only touches entries with **zero** existing `Task` rows, re-checked *inside* each transaction. A second run finds those entries now have tasks → skips them. No duplicates.
- **Goals:** `commitExtractedItems` dedupes by case-insensitive title (existing → bump `lastMentionedAt`/`entryRefs`; new → create). Re-running bumps rather than duplicates.
- **Concurrency:** the in-transaction re-check also guards against a user committing in-app between the query and the write.

## Decisions for your review
1. **Window:** all-time (75 entries, back to 2026-04-20) — *recommended*, these are genuinely owed — or limit to recent (64 in 30d / 38 in 7d) to avoid surfacing 2-month-old tasks? Pass `--since=` to limit.
2. **Founder accounts** (jim@, jim+slice2pro@, keenan@): include or skip?
3. Approve → I (or you, from home) run dry-run first, paste the output for a final check, then `--commit`.

**No rows will be created until you approve.**

---

# DRY-RUN OUTPUT (2026-06-08) — read-only, nothing written

**Filters applied (per your decisions):** `createdAt > now() − 30 days` **AND** email NOT ending in `@heelerdigital.com`. Computed via read-only SQL that mirrors the script's exact `where` clause + the helper's empty-title skip + goal dedup (the `tsx` script can't reach Supabase from this environment — blocked ports per CLAUDE.md — so this is the SQL-equivalent of `--since=2026-05-09` dry-run; the script run from your home network will produce the same task/goal counts).

## Totals (would create)
| Metric | All-time (prior) | **30d + founders excluded (this run)** |
|---|---|---|
| Entries | 75 | **57** |
| Users | 21 | **18** |
| **Tasks created** | 179 | **138** |
| Goals created (new) | ≤61 | **≤45** (45 candidates, 0 match an existing goal title → all new; intra-batch title dupes may net slightly fewer) |
| Tasks skipped (empty title) | — | **0** |
| Errors | — | **0** |

## Per-user breakdown (18 users, after filters)
| Email | Plan | Entries | Tasks |
|---|---|---|---|
| midnightoilandtincture@gmail.com | TRIAL | 7 | 22 |
| cazdavies060@gmail.com | PRO | 12 | 22 |
| programmingnyc@gmail.com | PRO | 8 | 19 |
| kaiberworks@gmail.com | PRO | 5 | 13 |
| erinkate826@gmail.com | TRIAL | 6 | 11 |
| stefanie@stefaniemullen.com | PRO | 4 | 10 |
| tomwebster@gmail.com | TRIAL | 1 | 6 |
| becky69clark@gmail.com | TRIAL | 1 | 6 |
| only1honeybrown@gmail.com | TRIAL | 3 | 5 |
| mostdaysnicole@gmail.com | TRIAL | 2 | 4 |
| heatherjackson0047@gmail.com | TRIAL | 1 | 4 |
| **thelmabowlen@gmail.com** (reported) | TRIAL | 1 | 4 |
| mergler95@gmail.com | TRIAL | 1 | 3 |
| emily101infante@gmail.com | TRIAL | 1 | 3 |
| mreddit9095@gmail.com | TRIAL | 1 | 3 |
| author.mpokocky@gmail.com | TRIAL | 1 | 1 |
| kitter1022@gmail.com | TRIAL | 1 | 1 |
| bachillerchasity@gmail.com | TRIAL | 1 | 1 |
| **Total** | | **57** | **138** |

Founders excluded as instructed: `jim@heelerdigital.com` (was 20 tasks), `keenan@heelerdigital.com` (20), `jim+slice2pro@heelerdigital.com` (1) — gone. Stefanie's 3 older `rawAnalysis`-null entries are *not* here (no candidates to commit; they need re-extraction, optional).

## Errors / skips
- **0 tasks skipped** for empty/whitespace titles (all 138 have valid titles).
- **0 errors** anticipated — every candidate row is well-formed; group resolution falls back to the user's "Other" group (or null) when `groupName` doesn't match.

## Idempotency — confirmed
The affected set is defined by **`NOT EXISTS (Task WHERE entryId = entry.id)`**, re-checked inside each per-entry transaction. After a `--commit` run those 57 entries each have ≥1 Task row, so a **second run's candidate set is empty → 0 tasks, 0 goals created.** Goals additionally dedupe by case-insensitive title (existing → bump, not duplicate). Safe to re-run.

**Script command for the approved run** (from your home network):
```
DATABASE_URL=<prod> npx tsx apps/web/scripts/backfill-extraction-commit.ts --since=2026-05-09            # dry-run
DATABASE_URL=<prod> npx tsx apps/web/scripts/backfill-extraction-commit.ts --since=2026-05-09 --commit   # writes
```
(The script now defaults to a 30-day window and always excludes `@heelerdigital.com`, so a bare run == this; `--since` shown for explicitness.)
