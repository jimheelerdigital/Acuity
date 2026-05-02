/**
 * v1.1 free-tier slice 6 — soft cap auto-evaluator.
 *
 * Spec: docs/v1-1/free-tier-phase2-plan.md §C.4. Runs every Sunday
 * at 06:00 UTC. Each tick:
 *   1. Computes the three threshold metrics (FREE user count,
 *      median per-user-per-day recording cadence over 14d,
 *      FREE→PRO conversion rate over 30d).
 *   2. Persists a FreeCapEvaluation row.
 *   3. If trailing 7 evaluations all met conditions AND the
 *      `free_recording_cap` feature flag is currently OFF, flips
 *      it ON via prisma.featureFlag.update + writes a FreeCapAuditLog
 *      row with action="AUTO_ENABLED".
 *
 * Sticky once flipped — the cron never auto-disables. Manual
 * disable via /admin (writes FreeCapAuditLog action="MANUAL_DISABLED").
 * The 7-cycle rule means ~7 weeks of sustained pressure before the
 * cap engages. Single-week metric blips don't trigger.
 *
 * Triggers: cron only. There's no event variant — we don't want
 * one-shot dispatches re-evaluating the gate ad-hoc.
 *
 * Inngest registration: 2-arg createFunction with triggers inside
 * config (post-C4-outage convention; same shape as drain-pending-
 * calendar-tasks + backfill-extractions).
 */

import { inngest } from "@/inngest/client";
import {
  allCapConditionsMet,
  CAP_REQUIRED_CYCLES,
  shouldFlipCapOn,
} from "@/lib/free-cap";
import { safeLog } from "@/lib/safe-log";

/**
 * Trailing 14 days for the cadence metric. Trailing 30 days for
 * the conversion rate. Both intentionally generous windows so a
 * weekly tick has stable signal.
 */
const CADENCE_WINDOW_DAYS = 14;
const CONVERSION_WINDOW_DAYS = 30;
const FREE_RECORDING_CAP_FLAG_KEY = "free_recording_cap";

export const freeCapEvaluatorFn = inngest.createFunction(
  {
    id: "free-cap-evaluator",
    name: "Soft cap auto-evaluator (weekly)",
    retries: 2,
    triggers: [{ cron: "0 6 * * 0" }],
  },
  async ({ step }) => {
    const { prisma } = await import("@/lib/prisma");

    // ── Step 1: compute the three metrics ──────────────────────────
    const metrics = await step.run("compute-metrics", async () => {
      const now = new Date();
      const cadenceWindowStart = new Date(
        now.getTime() - CADENCE_WINDOW_DAYS * 24 * 60 * 60 * 1000
      );
      const conversionWindowStart = new Date(
        now.getTime() - CONVERSION_WINDOW_DAYS * 24 * 60 * 60 * 1000
      );

      // Count FREE users — post-trial-free, status="FREE" OR (TRIAL
      // with trialEndsAt in the past). The query approximates with
      // a string match + date check; close enough for the gate.
      const freeUserCount = await prisma.user.count({
        where: {
          OR: [
            { subscriptionStatus: "FREE" },
            {
              subscriptionStatus: "TRIAL",
              trialEndsAt: { lte: now },
            },
          ],
        },
      });

      // Median cadence — recordings per FREE user per day over 14d.
      // Queried as raw SQL so we get a true median (Prisma can't
      // express percentile_cont directly). Returns 0 if no data.
      type MedianRow = { median: number | null };
      const cadenceRows = await prisma.$queryRaw<MedianRow[]>`
        WITH per_user AS (
          SELECT u."id" AS uid,
                 COUNT(e."id")::float / ${CADENCE_WINDOW_DAYS}::float AS perday
          FROM "User" u
          LEFT JOIN "Entry" e
            ON e."userId" = u."id"
            AND e."createdAt" > ${cadenceWindowStart}
            AND e."status" = 'COMPLETE'
          WHERE u."subscriptionStatus" = 'FREE'
             OR (u."subscriptionStatus" = 'TRIAL' AND u."trialEndsAt" <= ${now})
          GROUP BY u."id"
        )
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY perday) AS median
        FROM per_user
      `;
      const medianCadence = Number(cadenceRows[0]?.median ?? 0);

      // Conversion rate — among FREE users created in the last 30d
      // (cohort window), what fraction has subscriptionStatus = PRO
      // now? Approximation: actual cohort conversion would track
      // upgrade events, but we don't have that table yet.
      // freeRecordingsResetAt is the closest proxy for "active FREE
      // user" but unreliable; falling back to "users currently PRO
      // who were created in the last 30 days" / "all users created
      // in the last 30 days".
      const cohortTotal = await prisma.user.count({
        where: { createdAt: { gte: conversionWindowStart } },
      });
      const cohortPro = await prisma.user.count({
        where: {
          createdAt: { gte: conversionWindowStart },
          subscriptionStatus: "PRO",
        },
      });
      const conversionRate = cohortTotal > 0 ? cohortPro / cohortTotal : 0;

      return {
        evaluatedAt: now,
        freeUserCount,
        medianCadence,
        conversionRate,
      };
    });

    const allMet = allCapConditionsMet({
      freeUserCount: metrics.freeUserCount,
      medianCadence: metrics.medianCadence,
      conversionRate: metrics.conversionRate,
    });

    // ── Step 2: persist the per-tick evaluation ─────────────────────
    const evaluationId = await step.run("persist-evaluation", async () => {
      const row = await prisma.freeCapEvaluation.create({
        data: {
          freeUserCount: metrics.freeUserCount,
          medianCadence: metrics.medianCadence,
          conversionRate: metrics.conversionRate,
          allConditionsMet: allMet,
        },
        select: { id: true },
      });
      return row.id;
    });

    // ── Step 3: 7-cycle check + sticky flip ─────────────────────────
    const flipResult = await step.run("evaluate-flip", async () => {
      const flag = await prisma.featureFlag.findUnique({
        where: { key: FREE_RECORDING_CAP_FLAG_KEY },
        select: { id: true, enabled: true },
      });
      if (flag?.enabled) {
        // Already on — sticky. Nothing to do.
        return { flipped: false, reason: "already-enabled" };
      }
      if (!flag) {
        // Flag doesn't exist yet — seed must run before the cron
        // can flip anything. Fail loudly so we notice.
        return { flipped: false, reason: "flag-missing" };
      }

      // Trailing 7 evaluations including this tick (the row we
      // just inserted), newest first.
      const trailing = await prisma.freeCapEvaluation.findMany({
        orderBy: { evaluatedAt: "desc" },
        take: CAP_REQUIRED_CYCLES,
        select: { id: true, allConditionsMet: true },
      });

      if (!shouldFlipCapOn(trailing)) {
        return {
          flipped: false,
          reason: "insufficient-cycles",
          trailingCount: trailing.length,
        };
      }

      // All 7 met — flip the flag on + audit log, in a transaction.
      await prisma.$transaction([
        prisma.featureFlag.update({
          where: { id: flag.id },
          data: { enabled: true, rolloutPercentage: 100 },
        }),
        prisma.freeCapAuditLog.create({
          data: {
            action: "AUTO_ENABLED",
            triggeringEvaluationIds: trailing.map((e) => e.id),
            notes: null,
          },
        }),
      ]);

      return {
        flipped: true,
        triggeringEvaluationIds: trailing.map((e) => e.id),
      };
    });

    safeLog.info("free-cap-evaluator.tick", {
      evaluationId,
      freeUserCount: metrics.freeUserCount,
      medianCadence: metrics.medianCadence,
      conversionRate: metrics.conversionRate,
      allConditionsMet: allMet,
      flipResult,
    });

    return {
      evaluationId,
      ...metrics,
      allConditionsMet: allMet,
      ...flipResult,
    };
  }
);
