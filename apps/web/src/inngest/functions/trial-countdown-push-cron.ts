/**
 * Trial countdown push cron — slice 9 (2026-05-25).
 *
 * Hourly cron that mirrors the T-3 and T+0 email cohorts as push
 * notifications. Idempotent on the dedicated User.trialT3PushSentAt
 * + User.trialEndedPushSentAt columns Jim added in slice 3.
 *
 * Cohort gating (parallel to trial-countdown-emails-cron):
 *   - T-3 push: trialEndsAt ∈ [now + 2.5d, now + 3.5d], status=TRIAL,
 *               trialT3PushSentAt null, pushToken NOT null
 *   - T+0 push: trialExpiredAt ∈ [now − 24h, now],
 *               trialEndedPushSentAt null, pushToken NOT null
 *
 * Why only T-3 and T+0 (not the full email sequence): push is more
 * disruptive than email. The two most actionable moments are "you
 * have three days" + "your trial just ended". The other emails do
 * the work of warming the user up + handling re-engagement.
 *
 * ⚠️ HIGH RISK gating: this cron does nothing today because no user
 * has a pushToken — the mobile-side registration is paused pending
 * Jim's go/no-go (touches live app launch + auth + a new API). When
 * mobile lands, users start showing up in these cohorts naturally.
 * Until then the cron logs "noop=N" each hour.
 */

import { inngest } from "@/inngest/client";
import { safeLog } from "@/lib/safe-log";
import {
  sendCountdownPush,
  type CountdownPushKey,
} from "@/lib/trial-countdown-push";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const trialCountdownPushCronFn = inngest.createFunction(
  {
    id: "trial-countdown-push-cron",
    name: "Trial countdown push (T-3 / T+0)",
    triggers: [{ cron: "0 * * * *" }],
    retries: 2,
  },
  async ({ step, logger }) => {
    const { prisma } = await import("@/lib/prisma");
    const now = new Date();
    const tally: Record<CountdownPushKey, number> = {
      trial_countdown_t3_push: 0,
      trial_ended_t0_push: 0,
    };

    // T-3 cohort
    await step.run("push-t3", async () => {
      const lower = new Date(now.getTime() + 2.5 * ONE_DAY_MS);
      const upper = new Date(now.getTime() + 3.5 * ONE_DAY_MS);
      const users = await prisma.user.findMany({
        where: {
          subscriptionStatus: "TRIAL",
          trialEndsAt: { gte: lower, lt: upper },
          trialT3PushSentAt: null,
          pushToken: { not: null },
        },
        select: { id: true },
      });
      for (const u of users) {
        const sent = await sendCountdownPush(u.id, "trial_countdown_t3_push");
        if (sent) tally.trial_countdown_t3_push += 1;
      }
      return { count: tally.trial_countdown_t3_push, candidates: users.length };
    });

    // T+0 cohort — only after expiration cron has flipped them and
    // stamped trialExpiredAt. The cron's pushToken filter naturally
    // limits this to users we can actually reach.
    await step.run("push-t0", async () => {
      const lower = new Date(now.getTime() - ONE_DAY_MS);
      const users = await prisma.user.findMany({
        where: {
          trialExpiredAt: { gte: lower, lt: now },
          trialEndedPushSentAt: null,
          pushToken: { not: null },
        },
        select: { id: true },
      });
      for (const u of users) {
        const sent = await sendCountdownPush(u.id, "trial_ended_t0_push");
        if (sent) tally.trial_ended_t0_push += 1;
      }
      return { count: tally.trial_ended_t0_push, candidates: users.length };
    });

    safeLog.info("trial-countdown-push-cron.tick", { tally });
    logger.info(
      `trial-countdown-push-cron: ` +
        Object.entries(tally)
          .map(([k, n]) => `${k}=${n}`)
          .join(", ")
    );

    return tally;
  }
);
