/**
 * Trial expiration cron — slice 2 (2026-05-25).
 *
 * Daily at 02:00 UTC, finds users whose trial has ended and flips
 * their subscriptionStatus from TRIAL → FREE. Stamps `trialExpiredAt`
 * at the same time so:
 *   1. We have a record of when the transition actually fired (vs
 *      the trialEndsAt itself, which is the policy date).
 *   2. Downstream T+0 / T+3 re-engagement emails (slice 4) gate on
 *      `trialExpiredAt` being recently-set, not on `trialEndsAt`
 *      passing.
 *   3. The cron is naturally idempotent — once trialExpiredAt is
 *      set, the WHERE clause excludes that user on every future run.
 *
 * Why 02:00 UTC: avoids the busy 00:00–01:00 hour when many other
 * crons fire (snapshot, content factory, etc.). Off-peak for the
 * Stripe webhook retry window too — a user who paid at 23:55 has a
 * couple of hours of webhook retry budget before they could
 * accidentally be flipped to FREE.
 *
 * 1-hour skew buffer: we only flip users whose trialEndsAt was AT
 * LEAST 1h ago. Tightens the race between trialExpiredAt timestamp
 * and a paying user's stripeWebhook firing webhook close to the
 * trial boundary. Worst-case latency for a real expiry → email is
 * 25h (cron fires 1-25h after the trial ended). Acceptable.
 *
 * Manual deploy ops note: schema.prisma carries
 * User.trialExpiredAt; the column is already live in prod (applied
 * by Jim 2026-05-25). No `prisma migrate` step needed before
 * shipping this function.
 */

import { inngest } from "@/inngest/client";
import { safeLog } from "@/lib/safe-log";

const ONE_HOUR_MS = 60 * 60 * 1000;

export const trialExpirationCronFn = inngest.createFunction(
  {
    id: "trial-expiration-cron",
    name: "Trial expiration — TRIAL → FREE transition",
    triggers: [{ cron: "0 2 * * *" }],
    retries: 2,
  },
  async ({ logger }) => {
    const { prisma } = await import("@/lib/prisma");
    const now = new Date();
    const cutoff = new Date(now.getTime() - ONE_HOUR_MS);

    // Eligible users: status still TRIAL, trial end at least 1h in
    // the past, AND we haven't already stamped trialExpiredAt. The
    // last guard is the idempotency belt; the first two are the
    // braces.
    const expired = await prisma.user.findMany({
      where: {
        subscriptionStatus: "TRIAL",
        trialEndsAt: { lt: cutoff },
        trialExpiredAt: null,
      },
      select: { id: true, email: true, trialEndsAt: true },
    });

    if (expired.length === 0) {
      safeLog.info("trial-expiration-cron.noop", { now: now.toISOString() });
      return { transitioned: 0 };
    }

    // updateMany so the whole batch flips atomically. We re-assert
    // the same WHERE clause so a Stripe webhook arriving mid-cron
    // for one of these users (race window: ~10ms) doesn't get
    // overwritten — Prisma uses a WHERE on each row at write time.
    const result = await prisma.user.updateMany({
      where: {
        id: { in: expired.map((u) => u.id) },
        subscriptionStatus: "TRIAL",
        trialExpiredAt: null,
      },
      data: {
        subscriptionStatus: "FREE",
        trialExpiredAt: now,
      },
    });

    safeLog.info("trial-expiration-cron.transitioned", {
      candidateCount: expired.length,
      transitionedCount: result.count,
      sampleIds: expired.slice(0, 5).map((u) => u.id),
      cutoff: cutoff.toISOString(),
    });
    logger.info(
      `trial-expiration-cron: ${result.count}/${expired.length} users transitioned TRIAL → FREE`
    );

    return { transitioned: result.count, candidates: expired.length };
  }
);
