import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * v1.1 free-tier slice 6 — soft cap mechanism. Ships flag-off at
 * launch; the auto-evaluator cron flips the `free_recording_cap`
 * feature flag on per docs/v1-1/free-tier-phase2-plan.md §C.4
 * (sticky, requires 7 consecutive cycles of all 3 conditions).
 *
 * The cap applies ONLY to FREE post-trial users. PRO/TRIAL/PAST_DUE
 * are never capped — entitlement gating in `requireEntitlement`
 * handles those. The /api/record route is the integration point
 * (the only path that creates new Entry rows).
 *
 * Reset semantics: natural calendar-month boundary (UTC). The first
 * recording of a new month resets the counter to 1 and writes the
 * next reset boundary.
 *
 * Three states (per spec):
 *   - "ok"      — under the cap, recording proceeds, counter +1
 *   - "grace"   — recording 30 of 30, the "this one is on us"
 *                 grace recording. Proceeds normally; UI shows
 *                 the cap copy. Counter +1.
 *   - "blocked" — recording 31+. Returns 402; UI shows the cap
 *                 paywall. Counter NOT incremented.
 */

export const FREE_CAP_PER_MONTH = 30;

/**
 * Compute the reset boundary for a given timestamp — first
 * millisecond of the *next* UTC month. Pure function for tests.
 */
export function nextMonthResetBoundary(now: Date): Date {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  // Date constructor with month=12 rolls to next year — correct.
  return new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));
}

/**
 * Pure-functional evaluator. Does not touch Prisma. Tests cover
 * every branch (window expiry, cap arithmetic, sticky boundary).
 *
 * Inputs:
 *   - currentCount: User.freeRecordingsThisMonth (0 if null)
 *   - resetAt: User.freeRecordingsResetAt (null = first call ever)
 *   - now: current timestamp
 *
 * Outputs:
 *   - state: "ok" | "grace" | "blocked"
 *   - newCount: count to write back AFTER this recording (only
 *     for "ok" + "grace"; "blocked" returns the same currentCount)
 *   - newResetAt: reset boundary to write back
 */
export type FreeCapState = "ok" | "grace" | "blocked";

export interface FreeCapEvaluation {
  state: FreeCapState;
  newCount: number;
  newResetAt: Date;
}

export function evaluateFreeCap(
  currentCount: number | null | undefined,
  resetAt: Date | null | undefined,
  now: Date = new Date()
): FreeCapEvaluation {
  const count = currentCount ?? 0;
  // Window expired (or first call): start a new month at count=1.
  if (!resetAt || resetAt.getTime() <= now.getTime()) {
    const newReset = nextMonthResetBoundary(now);
    // First recording of the new window — under the cap by far.
    // The cap of 30 means: 1..29 = ok, 30 = grace, 31+ = blocked.
    return { state: "ok", newCount: 1, newResetAt: newReset };
  }

  // Window active. Decide based on the count BEFORE this recording.
  // Using the spec's "this one is on us" semantics:
  //   - count < 29  → ok (recording 1..29)
  //   - count === 29 → grace (recording 30)
  //   - count >= 30 → blocked (recording 31+)
  if (count >= FREE_CAP_PER_MONTH) {
    return {
      state: "blocked",
      newCount: count, // unchanged — blocked recording doesn't count
      newResetAt: resetAt,
    };
  }
  if (count === FREE_CAP_PER_MONTH - 1) {
    // This recording IS the 30th — grace path.
    return {
      state: "grace",
      newCount: FREE_CAP_PER_MONTH,
      newResetAt: resetAt,
    };
  }
  // Recordings 1..29 (count was 0..28).
  return {
    state: "ok",
    newCount: count + 1,
    newResetAt: resetAt,
  };
}

/**
 * Side-effect wrapper. Reads the user's current cap state, decides
 * whether the recording proceeds, and writes back the updated
 * counter for "ok" and "grace" states (transactional with the
 * caller's tx so a recording-write rollback unwinds the counter).
 *
 * Returns the FreeCapState so the caller (likely /api/record)
 * decides response behavior:
 *   - "ok"      → proceed silently
 *   - "grace"   → proceed but flag the response so UI can show
 *                 the "30/30 — this one is on us" modal
 *   - "blocked" → return 402, do NOT create Entry
 *
 * Caller is responsible for the feature-flag gate. This helper
 * assumes the cap should be enforced; check the flag at the route.
 */
export async function checkAndIncrementFreeCap(
  tx: PrismaClient | Prisma.TransactionClient,
  userId: string,
  now: Date = new Date()
): Promise<FreeCapState> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: {
      freeRecordingsThisMonth: true,
      freeRecordingsResetAt: true,
    },
  });
  if (!user) return "ok"; // Stale session — let auth gate handle it.

  const evaluation = evaluateFreeCap(
    user.freeRecordingsThisMonth,
    user.freeRecordingsResetAt,
    now
  );

  if (evaluation.state !== "blocked") {
    await tx.user.update({
      where: { id: userId },
      data: {
        freeRecordingsThisMonth: evaluation.newCount,
        freeRecordingsResetAt: evaluation.newResetAt,
      },
    });
  }

  return evaluation.state;
}

// ─── Auto-evaluator helpers ─────────────────────────────────────

/**
 * The 3-condition gate per spec §C.4. Pure function; tests cover
 * each axis independently and the AND combiner.
 */
export const CAP_THRESHOLDS = {
  freeUserCount: 25_000,
  medianCadence: 0.7,
  conversionRate: 0.01,
} as const;

export function allCapConditionsMet(metrics: {
  freeUserCount: number;
  medianCadence: number;
  conversionRate: number;
}): boolean {
  return (
    metrics.freeUserCount > CAP_THRESHOLDS.freeUserCount &&
    metrics.medianCadence >= CAP_THRESHOLDS.medianCadence &&
    metrics.conversionRate < CAP_THRESHOLDS.conversionRate
  );
}

/**
 * The 7-consecutive-cycle rule. Given a list of trailing
 * evaluations (newest first or oldest first — order-agnostic
 * because we count rather than sequence), returns true iff the
 * trailing 7 ALL met conditions.
 *
 * Caller fetches with ORDER BY evaluatedAt DESC LIMIT 7 then
 * passes them in. We don't enforce the "must be exactly 7" here
 * — fewer than 7 evaluations means the cron hasn't run long
 * enough; return false (cap stays off).
 */
export const CAP_REQUIRED_CYCLES = 7;

export function shouldFlipCapOn(
  trailingEvaluations: { allConditionsMet: boolean }[]
): boolean {
  if (trailingEvaluations.length < CAP_REQUIRED_CYCLES) return false;
  // Defensive — if more than 7 are passed, only consider the first
  // 7 (caller's responsibility to sort + limit; we don't sort).
  const window = trailingEvaluations.slice(0, CAP_REQUIRED_CYCLES);
  return window.every((e) => e.allConditionsMet);
}
