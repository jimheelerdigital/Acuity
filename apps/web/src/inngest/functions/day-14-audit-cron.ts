/**
 * Day 14 Life Audit cron. Fires daily at 22:00 UTC; finds every user
 * whose trial ends in the next 24h and doesn't already have a Day 14
 * audit in a non-terminal or COMPLETE state; seeds a LifeAudit row
 * with status=QUEUED and dispatches the per-user generation event.
 *
 * Invariant we rely on (IMPLEMENTATION_PLAN_PAYWALL §7.4): a user
 * never hits the paywall without having read their Life Audit. The
 * cron fires ~24h before trialEndsAt so the generator (background
 * retries up to ~14 min) plus the degraded fallback in onFailure all
 * fit within the window before enforcement activates.
 *
 * Retries: 3 (background). onFailure: logs only; individual
 * per-user audits are handled by the generator's own retry + degraded
 * fallback path.
 */

import { inngest } from "@/inngest/client";
import { safeLog } from "@/lib/safe-log";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const day14AuditCronFn = inngest.createFunction(
  {
    id: "day-14-audit-cron",
    name: "Day 14 Life Audit dispatcher",
    triggers: [{ cron: "0 22 * * *" }],
    retries: 3,
  },
  async () => {
    const { prisma } = await import("@/lib/prisma");

    const now = new Date();
    const expiresBy = new Date(now.getTime() + ONE_DAY_MS);

    // Users whose trial ends in the next 24h, status=TRIAL.
    const candidates = await prisma.user.findMany({
      where: {
        subscriptionStatus: "TRIAL",
        trialEndsAt: { gte: now, lt: expiresBy },
      },
      select: {
        id: true,
        email: true,
        createdAt: true,
        trialEndsAt: true,
      },
    });

    safeLog.info("day-14-audit-cron.tick", {
      now: now.toISOString(),
      windowEnd: expiresBy.toISOString(),
      candidateCount: candidates.length,
    });

    let dispatched = 0;
    let alreadyExists = 0;

    for (const user of candidates) {
      // Skip if this user already has a non-terminal or COMPLETE
      // audit (dedupe). Only re-dispatch if the prior attempt ended
      // FAILED — in which case we want a fresh run with a fresh
      // retry budget.
      const existing = await prisma.lifeAudit.findFirst({
        where: { userId: user.id, kind: "TRIAL_DAY_14" },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true },
      });
      if (existing && existing.status !== "FAILED") {
        alreadyExists++;
        continue;
      }

      const periodStart = user.createdAt;
      const periodEnd = user.trialEndsAt ?? now;

      const entryCount = await prisma.entry.count({
        where: {
          userId: user.id,
          status: "COMPLETE",
          entryDate: { gte: periodStart, lte: periodEnd },
        },
      });

      const audit = await prisma.lifeAudit.create({
        data: {
          userId: user.id,
          kind: "TRIAL_DAY_14",
          periodStart,
          periodEnd,
          entryCount,
          narrative: "",
          closingLetter: "",
          themesArc: {},
          status: "QUEUED",
        },
      });

      await inngest.send({
        name: "life-audit/generation.requested",
        data: { lifeAuditId: audit.id, userId: user.id },
      });

      safeLog.info("day-14-audit-cron.dispatched", {
        userId: user.id,
        email: user.email,
        lifeAuditId: audit.id,
        entryCount,
        trialEndsAt: user.trialEndsAt?.toISOString() ?? null,
      });

      dispatched++;
    }

    return {
      scannedAt: now.toISOString(),
      candidates: candidates.length,
      dispatched,
      alreadyExists,
    };
  }
);
