/**
 * Life Audit dispatcher ("Day 7" audit, kind TRIAL_DAY_14). Fires daily at
 * 22:00 UTC.
 *
 * 2026-10-27: WAIT FOR DATA. The audit used to be dispatched the night
 * before trial end regardless of entry count, and the generator's degraded
 * fallback then shipped a template audit to almost everyone (239 of 245).
 * Now each candidate goes through decideLifeAudit (lib/life-audit-
 * eligibility.ts):
 *  - generate once the user has 7+ completed entries in their first 30 days
 *    and their trial is ending or has ended;
 *  - with fewer, DEFER and look again tomorrow, up to day 30;
 *  - after that, nothing. There is no degraded audit any more.
 * Idempotent: an existing QUEUED/GENERATING/COMPLETE audit blocks dispatch,
 * and a FAILED one is retried at most once more.
 *
 * Retries: 3 (background). Per-user failures are the generator's concern.
 */

import { inngest } from "@/inngest/client";
import { entitlementsFor } from "@/lib/entitlements";
import {
  AUDIT_WINDOW_DAYS,
  auditWindowEnd,
  decideLifeAudit,
} from "@/lib/life-audit-eligibility";
import { safeLog } from "@/lib/safe-log";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const day7AuditCronFn = inngest.createFunction(
  {
    id: "day-7-audit-cron",
    name: "Day 7 Life Audit dispatcher",
    triggers: [{ cron: "0 22 * * *" }],
    retries: 3,
  },
  async () => {
    const { prisma } = await import("@/lib/prisma");

    const now = new Date();

    // Everyone whose trial is ending (next 24h) or has ended, and who
    // signed up within the window (+1 day grace). decideLifeAudit makes the
    // exact call per user; this query only bounds the scan.
    const candidates = await prisma.user.findMany({
      where: {
        trialEndsAt: { not: null, lt: new Date(now.getTime() + ONE_DAY_MS) },
        createdAt: {
          gte: new Date(now.getTime() - (AUDIT_WINDOW_DAYS + 1) * ONE_DAY_MS),
        },
      },
      select: {
        id: true,
        createdAt: true,
        trialEndsAt: true,
        subscriptionStatus: true,
        stripeFirstFailureAt: true,
      },
    });

    const tally: Record<string, number> = {};
    let dispatched = 0;

    for (const user of candidates) {
      const existing = await prisma.lifeAudit.findMany({
        where: { userId: user.id, kind: "TRIAL_DAY_14" },
        select: { status: true },
      });
      const windowEnd = auditWindowEnd(user.createdAt);
      const completedEntriesInWindow = await prisma.entry.count({
        where: {
          userId: user.id,
          status: "COMPLETE",
          entryDate: { gte: user.createdAt, lte: windowEnd },
        },
      });

      const decision = decideLifeAudit({
        now,
        createdAt: user.createdAt,
        trialEndsAt: user.trialEndsAt,
        entitled: entitlementsFor({
          subscriptionStatus: user.subscriptionStatus,
          trialEndsAt: user.trialEndsAt,
          stripeFirstFailureAt: user.stripeFirstFailureAt,
        }, now).canGenerateNewLifeAudit,
        completedEntriesInWindow,
        existingStatuses: existing.map((a) => a.status),
      });

      const key = decision.action === "dispatch" ? "dispatch" : decision.reason;
      tally[key] = (tally[key] ?? 0) + 1;
      if (decision.action !== "dispatch") continue;

      const audit = await prisma.lifeAudit.create({
        data: {
          userId: user.id,
          kind: "TRIAL_DAY_14",
          periodStart: decision.periodStart,
          periodEnd: decision.periodEnd,
          entryCount: completedEntriesInWindow,
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

      safeLog.info("day-7-audit-cron.dispatched", {
        userId: user.id,
        lifeAuditId: audit.id,
        entryCount: completedEntriesInWindow,
      });
      dispatched++;
    }

    safeLog.info("day-7-audit-cron.tick", {
      now: now.toISOString(),
      candidateCount: candidates.length,
      ...tally,
    });

    return {
      scannedAt: now.toISOString(),
      candidates: candidates.length,
      dispatched,
      tally,
    };
  }
);
