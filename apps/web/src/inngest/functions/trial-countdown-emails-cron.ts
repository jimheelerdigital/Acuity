/**
 * Trial countdown email cron — slice 4 (2026-05-25).
 *
 * Hourly cron that finds users in each of the five cohorts and
 * fires the matching email via `sendCountdownEmail`. Idempotent on
 * the dedicated SentAt columns Jim added in slice 3.
 *
 * Cohort gating:
 *   - T-7:  trialEndsAt ∈ [now + 6.5d, now + 7.5d], status=TRIAL, T7SentAt null
 *   - T-3:  trialEndsAt ∈ [now + 2.5d, now + 3.5d], status=TRIAL, T3SentAt null
 *   - T-1:  trialEndsAt ∈ [now + 0.5d, now + 1.5d], status=TRIAL, T1SentAt null
 *   - T+0:  trialExpiredAt ∈ [now − 24h, now], EndedSentAt null
 *           (only fires after the expiration cron flips status to FREE
 *            and stamps trialExpiredAt; gate naturally excludes still-
 *            TRIAL users via the trialExpiredAt non-null requirement)
 *   - T+3:  trialExpiredAt ∈ [now − 3.5d, now − 2.5d], status=FREE,
 *           T3PostSentAt null
 *
 * Hourly cadence + 1-day-wide windows means each user falls into a
 * cohort for ~24 ticks. The SentAt gate makes that safe — only the
 * first matching tick actually sends.
 *
 * First-deploy note: existing TRIAL users in the field may match
 * multiple cohorts on the very first run (e.g., a user 2 days from
 * trial end matches T-3 immediately). Cron sends only that one
 * email; users who PASSED the T-7 mark before this code shipped
 * won't get a backfilled T-7 send. That's intentional — the catch-
 * up email is the soonest applicable cohort, not the whole history.
 */

import { inngest } from "@/inngest/client";
import { safeLog } from "@/lib/safe-log";
import {
  sendCountdownEmail,
  type CountdownEmailKey,
} from "@/lib/trial-countdown-emails";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const HALF_DAY_MS = 12 * 60 * 60 * 1000;

interface CohortDef {
  key: CountdownEmailKey;
  sentAtField:
    | "trialT7EmailSentAt"
    | "trialT3EmailSentAt"
    | "trialT1EmailSentAt"
    | "trialEndedEmailSentAt"
    | "trialT3PostEmailSentAt";
}

const COHORTS: CohortDef[] = [
  { key: "trial_countdown_t7", sentAtField: "trialT7EmailSentAt" },
  { key: "trial_countdown_t3", sentAtField: "trialT3EmailSentAt" },
  { key: "trial_countdown_t1", sentAtField: "trialT1EmailSentAt" },
  { key: "trial_ended_t0", sentAtField: "trialEndedEmailSentAt" },
  { key: "trial_reengagement_t3", sentAtField: "trialT3PostEmailSentAt" },
];

export const trialCountdownEmailsCronFn = inngest.createFunction(
  {
    id: "trial-countdown-emails-cron",
    name: "Trial countdown emails (T-7 / T-3 / T-1 / T+0 / T+3)",
    triggers: [{ cron: "0 * * * *" }],
    retries: 2,
  },
  async ({ step, logger }) => {
    const { prisma } = await import("@/lib/prisma");
    const now = new Date();
    const tally: Record<CountdownEmailKey, number> = {
      trial_countdown_t7: 0,
      trial_countdown_t3: 0,
      trial_countdown_t1: 0,
      trial_ended_t0: 0,
      trial_reengagement_t3: 0,
    };

    // T-7 cohort
    await step.run("send-t7", async () => {
      const lower = new Date(now.getTime() + 6.5 * ONE_DAY_MS);
      const upper = new Date(now.getTime() + 7.5 * ONE_DAY_MS);
      const users = await prisma.user.findMany({
        where: {
          subscriptionStatus: "TRIAL",
          trialEndsAt: { gte: lower, lt: upper },
          trialT7EmailSentAt: null,
        },
        select: { id: true },
      });
      for (const u of users) {
        const r = await sendCountdownEmail(u.id, "trial_countdown_t7");
        if (r.sent) tally.trial_countdown_t7 += 1;
      }
      return { count: tally.trial_countdown_t7, candidates: users.length };
    });

    // T-3 cohort
    await step.run("send-t3", async () => {
      const lower = new Date(now.getTime() + 2.5 * ONE_DAY_MS);
      const upper = new Date(now.getTime() + 3.5 * ONE_DAY_MS);
      const users = await prisma.user.findMany({
        where: {
          subscriptionStatus: "TRIAL",
          trialEndsAt: { gte: lower, lt: upper },
          trialT3EmailSentAt: null,
        },
        select: { id: true },
      });
      for (const u of users) {
        const r = await sendCountdownEmail(u.id, "trial_countdown_t3");
        if (r.sent) tally.trial_countdown_t3 += 1;
      }
      return { count: tally.trial_countdown_t3, candidates: users.length };
    });

    // T-1 cohort
    await step.run("send-t1", async () => {
      const lower = new Date(now.getTime() + HALF_DAY_MS);
      const upper = new Date(now.getTime() + 1.5 * ONE_DAY_MS);
      const users = await prisma.user.findMany({
        where: {
          subscriptionStatus: "TRIAL",
          trialEndsAt: { gte: lower, lt: upper },
          trialT1EmailSentAt: null,
        },
        select: { id: true },
      });
      for (const u of users) {
        const r = await sendCountdownEmail(u.id, "trial_countdown_t1");
        if (r.sent) tally.trial_countdown_t1 += 1;
      }
      return { count: tally.trial_countdown_t1, candidates: users.length };
    });

    // T+0 cohort — only after expiration cron has flipped them.
    await step.run("send-t0", async () => {
      const lower = new Date(now.getTime() - ONE_DAY_MS);
      const users = await prisma.user.findMany({
        where: {
          trialExpiredAt: { gte: lower, lt: now },
          trialEndedEmailSentAt: null,
        },
        select: { id: true },
      });
      for (const u of users) {
        const r = await sendCountdownEmail(u.id, "trial_ended_t0");
        if (r.sent) tally.trial_ended_t0 += 1;
      }
      return { count: tally.trial_ended_t0, candidates: users.length };
    });

    // T+3 cohort
    await step.run("send-t3-post", async () => {
      const lower = new Date(now.getTime() - 3.5 * ONE_DAY_MS);
      const upper = new Date(now.getTime() - 2.5 * ONE_DAY_MS);
      const users = await prisma.user.findMany({
        where: {
          subscriptionStatus: "FREE",
          trialExpiredAt: { gte: lower, lt: upper },
          trialT3PostEmailSentAt: null,
        },
        select: { id: true },
      });
      for (const u of users) {
        const r = await sendCountdownEmail(u.id, "trial_reengagement_t3");
        if (r.sent) tally.trial_reengagement_t3 += 1;
      }
      return { count: tally.trial_reengagement_t3, candidates: users.length };
    });

    safeLog.info("trial-countdown-emails-cron.tick", { tally });
    logger.info(
      `trial-countdown-emails-cron: ` +
        Object.entries(tally)
          .map(([k, n]) => `${k}=${n}`)
          .join(", ")
    );

    return tally;
  }
);
