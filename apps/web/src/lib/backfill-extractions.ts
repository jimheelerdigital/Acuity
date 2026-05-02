import "server-only";

/**
 * Pure helpers for the v1.1 free-tier slice 5 "Process my history"
 * backfill flow. Inngest function lives at
 * `apps/web/src/inngest/functions/backfill-extractions.ts`; this
 * module owns the eligibility math + the time-window selectors so
 * the routes + the function can share one definition (and the
 * tests can hit pure functions without Prisma plumbing).
 *
 * Spec: docs/v1-1/free-tier-phase2-plan.md §A.4-A.6.
 */

/**
 * 60-day cap. Per Jim's pushback A — bound worst-case cost at
 * ~$0.66/user (60 entries × $0.011 Claude). Older entries route
 * to the second `/account` "Process older entries" surface with
 * an explicit cost-warning modal.
 */
export const BACKFILL_WINDOW_RECENT_DAYS = 60;

/**
 * Window discriminator on `/api/backfill/start`. Default `recent`.
 * `older` widens the WHERE clause to `createdAt <= now-60d`.
 */
export type BackfillWindow = "recent" | "older";

/**
 * Per-window cutoff. `recent` = entries newer than 60d; `older` =
 * entries 60d+ old. Each window is mutually exclusive — together
 * they cover everything; `recent` is the default + cheap surface,
 * `older` is the explicit follow-up.
 */
export function backfillWindowCutoff(
  window: BackfillWindow,
  now: Date = new Date()
): { gt?: Date; lte?: Date } {
  const cutoff = new Date(
    now.getTime() - BACKFILL_WINDOW_RECENT_DAYS * 24 * 60 * 60 * 1000
  );
  return window === "recent" ? { gt: cutoff } : { lte: cutoff };
}

/**
 * Eligibility predicate — pure function for tests. Mirrors the
 * Prisma WHERE clause used by both the API route's count call and
 * the Inngest function's load step.
 *
 * An entry is eligible iff:
 *   - `extracted` is false (canonical flag set when full pipeline
 *     completed; defaults false per schema)
 *   - `rawAnalysis IS NULL` (defense-in-depth pre-SQL-backfill of
 *     historical PRO entries — those have rawAnalysis set even
 *     though their `extracted` flag is false until a one-shot
 *     `UPDATE Entry SET extracted = true WHERE rawAnalysis IS NOT
 *     NULL` runs separately)
 *   - `status === "COMPLETE"` (won't loop FAILED/PARTIAL/QUEUED)
 *   - `transcript` non-empty (Whisper succeeded; nothing to
 *     re-extract from otherwise)
 *   - createdAt within the requested window
 */
export interface BackfillCandidate {
  id: string;
  extracted: boolean;
  rawAnalysis: unknown;
  status: string;
  transcript: string | null;
  createdAt: Date;
}

export function isBackfillEligible(
  entry: BackfillCandidate,
  window: BackfillWindow,
  now: Date = new Date()
): boolean {
  if (entry.extracted) return false;
  if (entry.rawAnalysis !== null && entry.rawAnalysis !== undefined) return false;
  if (entry.status !== "COMPLETE") return false;
  if (!entry.transcript || entry.transcript.trim().length === 0) return false;

  const cutoff = backfillWindowCutoff(window, now);
  const ts = entry.createdAt.getTime();
  if (cutoff.gt && ts <= cutoff.gt.getTime()) return false;
  if (cutoff.lte && ts > cutoff.lte.getTime()) return false;
  return true;
}

/**
 * Bulk filter — same predicate, batched over an array. Used in
 * tests to verify the WHERE-clause shape matches the predicate
 * (drift between the two would silently cause double-processing
 * or skipped entries).
 */
export function selectBackfillCandidates(
  entries: BackfillCandidate[],
  window: BackfillWindow,
  now: Date = new Date()
): BackfillCandidate[] {
  return entries.filter((e) => isBackfillEligible(e, window, now));
}
