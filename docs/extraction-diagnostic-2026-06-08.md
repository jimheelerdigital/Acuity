# Extraction P0 — Diagnostic (2026-06-08)

**Status:** Diagnostic only. No code changed. Hold for triage.
**Verdict: extraction is NOT broken. The alarm came from reading the wrong DB column. The real problem is the review→commit funnel.**

## The headline correction
The report read **`rawExtraction`** (NULL → "80% no extraction"). The pipeline never writes that column — it's **orphaned and NULL on 100% of entries (0/66)**. The real extraction output lands in **`rawAnalysis`**, which is **populated on 66 of 69 COMPLETE entries (96%)**. Extraction ran fine.

Proof — Thelma's entry (`cmq4i9rzv0005x80wbef05vr6`, TRIAL active): `rawAnalysis` holds **4 correctly-extracted tasks** ("Request transcript from LaSalle", "Get transcript verified through WES", "Obtain marriage certificate", "Update passport with married name") + 2 goals. Her `rawExtraction` is null (the column the report saw); her tasks were extracted perfectly.

## What's actually wrong — the commit funnel (the real fire)
By design (`process-entry.ts:673–676` + `api/entries/[id]/extraction/route.ts`), extracted tasks/goals are **held in `rawAnalysis.tasks`** and only become real `Task`/`Goal` rows when the user **reviews + commits** them via the entry-detail banner. Production reality (last 7 days):
- **47** entries have task candidates extracted.
- **31 entries / 73 task candidates sit UNCOMMITTED** — the user never completed the review.
- **7 entries (incl. Thelma): committed but their candidates were NOT created** (committed empty / "skip"), so the tasks were lost. Worse, the commit route returns **409 "Already reviewed"** once `extractionCommittedAt` is set (`extraction/route.ts:173`) → **these users are locked out and can't recover their tasks in-app.**

So: record → AI extracts perfectly → but tasks rarely materialize, because the manual commit step barely completes and, when it "completes" empty, strands the tasks. That's why it *feels* like "extraction is broken."

## Findings table
| # | Finding | Evidence | Severity |
|---|---|---|---|
| RED HERRING | `rawExtraction` column is orphaned/NULL everywhere; real data in `rawAnalysis` | `rawExtraction` populated on 0/66; `rawAnalysis` on 66/69 | n/a (caused the false alarm) |
| BUG A (the fire) | Extracted tasks need manual review-commit; funnel barely completes + 409 locks out re-commit | 31 uncommitted entries, 73 stranded candidates, 7 committed-but-lost | **functional / product** |
| BUG B | `extracted` flag is never set by the main pipeline | `extracted=true` on **0/69**; setter exists only in try-claim + backfill, not in `process-entry.ts` persist step | functional (metadata) |
| ISOLATED | 3 entries genuinely have no `rawAnalysis` | all one user (stefanie), single 4-min window 2026-06-03 (5 days ago) — transient/non-entitled-at-record | low |

## Same bug or different?
**Three distinct things.** Bug A (commit funnel) is the cause of "users don't get tasks." Bug B (`extracted` flag) is independent and does NOT cause Bug A — it's a metadata gap (data is safe in `rawAnalysis`). The `rawExtraction` red herring is what made A look like an extraction outage. The 3 nulls are an old isolated blip, unrelated.

## Where extraction runs (for completeness)
`/api/record` → `ENABLE_INNGEST_PIPELINE==="1"` ? Inngest `process-entry.ts` : sync `processEntry` (`lib/pipeline.ts`). Both call `extractFromTranscript` (model `claude-sonnet-4-6` — **current, not deprecated**). Free/expired-trial users short-circuit to summary-only (no extraction) by design (`process-entry.ts:325`). API key / model / rate-limit are NOT implicated — 96% extract successfully.

## Proposed fixes (for your triage — NOT implemented)
1. **Bug A (decide the model):**
   - **(a) Auto-commit** extracted tasks (drop/soften the review gate) → tasks appear immediately, matches the "AI extracts your tasks" promise. *Recommended* given 73 stranded candidates.
   - **(b)** Keep the review gate but make the banner unmissable AND fix the "committed-empty" path (likely the review UI defaults tasks unchecked or skip is too easy) AND remove/relax the **409 lockout** so users can re-review.
2. **Bug B:** wire `extracted: true` into the `persist-extraction` step (and the sync pipeline's persist) so the flag reflects reality.
3. **Recovery / "give users their tasks back":** no re-extraction needed — data is intact in `rawAnalysis`. **Backfill-commit** the 31 uncommitted + 7 committed-but-lost: create `Task`/`Goal` rows from `rawAnalysis.tasks`/`goals`; for the 7, also clear `extractionCommittedAt` (or bypass the 409). **Thelma:** create her 4 tasks + 2 goals from `rawAnalysis` directly.
4. **Cleanup (low priority):** drop or document the orphaned `rawExtraction` column so it can't cause this confusion again.
5. **3 stefanie nulls:** optional — re-run extraction on those 3 (they truly lack `rawAnalysis`).

## Recommended sequence
1. Decide Bug A model (auto-commit vs fix-the-gate) — this is the product call.
2. Backfill-commit stranded candidates (recover Thelma + 30 others) — read-only-derived, reversible.
3. Wire the `extracted` flag.
All read/verified against prod (`rohjfcenylmfnqoyoirn`) via read-only SELECTs. No writes performed.
