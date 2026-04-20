/**
 * STUB: logs-only until the Life Audit generator lands in a paywall
 * PR. Real implementation will create a LifeAudit row with status
 * GENERATING, queue narrative generation, and handle the degraded
 * fallback per IMPLEMENTATION_PLAN_PAYWALL.md §7.3.
 *
 * Why ship a stub: this proves the scheduled-job primitive works
 * end-to-end (Inngest cron fires → our handler invoked → DB queried
 * → per-user event dispatch or log) before the paywall PR layers
 * real work on top. It's the "Inngest PR 6" proof point in
 * INNGEST_MIGRATION_PLAN.md §11.
 *
 * Schedule: daily at 22:00 UTC.
 * Budget: query users whose trialEndsAt falls in the next 24 hours
 *         AND who don't already have a TRIAL_DAY_14 LifeAudit row.
 * Action: safeLog one line per eligible user (hashed email, trial
 *         expiry). The real generator will replace this with a
 *         per-user `life-audit/day-14-due` event dispatch.
 * Retries: 3 (background — the cron has all day to run; missing a
 *         tick by a few minutes is fine).
 */

import { inngest } from "@/inngest/client";
import { safeLog } from "@/lib/safe-log";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const day14AuditCronFn = inngest.createFunction(
  {
    id: "day-14-audit-cron",
    name: "Day 14 Life Audit generator (stub)",
    triggers: [{ cron: "0 22 * * *" }],
    retries: 3,
  },
  async () => {
    const { prisma } = await import("@/lib/prisma");

    const now = new Date();
    const expiresBy = new Date(now.getTime() + ONE_DAY_MS);

    // Users whose trial ends in the next 24h, still in TRIAL status,
    // and who we haven't already generated an audit for.
    //
    // `LifeAudit` model doesn't exist yet — when it lands (paywall
    // PR), this query gains a `NOT EXISTS` clause / subquery. For
    // now we assume every eligible user is "candidate" and the real
    // code will dedupe.
    const candidates = await prisma.user.findMany({
      where: {
        subscriptionStatus: "TRIAL",
        trialEndsAt: { gte: now, lt: expiresBy },
      },
      select: { id: true, email: true, trialEndsAt: true },
    });

    safeLog.info("day-14-audit-cron.tick", {
      now: now.toISOString(),
      windowEnd: expiresBy.toISOString(),
      candidateCount: candidates.length,
    });

    for (const user of candidates) {
      safeLog.info("day-14-audit-cron.would_generate", {
        userId: user.id,
        email: user.email,
        trialEndsAt: user.trialEndsAt?.toISOString() ?? null,
      });
      // STUB: real implementation will inngest.send({
      //   name: "life-audit/day-14-due",
      //   data: { userId: user.id, trialEndsAt: ... }
      // }) per IMPLEMENTATION_PLAN_PAYWALL §3.4.
    }

    return {
      scannedAt: now.toISOString(),
      candidates: candidates.length,
      dispatched: 0, // always 0 in the stub
      stub: true,
    };
  }
);
