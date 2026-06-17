/**
 * Trial countdown email cron — slice 4 (2026-05-25).
 *
 * Hourly cron that finds users in each of the four cohorts and
 * fires the matching email via `sendCountdownEmail`. Idempotent on
 * the dedicated SentAt columns Jim added in slice 3.
 *
 * Cohort gating (7-day trial cadence; windows are relative to
 * trialEndsAt, so grandfathered 14-day trials still get each touch at
 * the right remaining-time offset):
 *   - mid-trial (Day 3 ≈ T-4): trialEndsAt ∈ [now + 3.5d, now + 4.5d],
 *           status=TRIAL, trialT7EmailSentAt null (legacy column reused)
 *   - urgency  (Day 5 ≈ T-2): trialEndsAt ∈ [now + 1.5d, now + 2.5d],
 *           status=TRIAL, trialT3EmailSentAt null (legacy column reused)
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
 * email; users who PASSED the mid-trial mark before this code shipped
 * won't get a backfilled mid-trial send. That's intentional — the catch-
 * up email is the soonest applicable cohort, not the whole history.
 */

import { inngest } from "@/inngest/client";
import { safeLog } from "@/lib/safe-log";
import {
  sendCountdownEmail,
  type CountdownEmailKey,
} from "@/lib/trial-countdown-emails";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

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
  { key: "trial_midtrial", sentAtField: "trialT7EmailSentAt" },
  { key: "trial_urgency", sentAtField: "trialT3EmailSentAt" },
  { key: "trial_ended_t0", sentAtField: "trialEndedEmailSentAt" },
  { key: "trial_reengagement_t3", sentAtField: "trialT3PostEmailSentAt" },
];

export const trialCountdownEmailsCronFn = inngest.createFunction(
  {
    id: "trial-countdown-emails-cron",
    name: "Trial countdown emails (mid-trial / urgency / ended / re-engage)",
    triggers: [{ cron: "0 * * * *" }],
    retries: 2,
  },
  async ({ step, logger }) => {
    const { prisma } = await import("@/lib/prisma");
    const now = new Date();
    const tally: Record<CountdownEmailKey, number> = {
      trial_midtrial: 0,
      trial_urgency: 0,
      trial_ended_t0: 0,
      trial_reengagement_t3: 0,
    };

    // Mid-trial cohort — Day 3 on a 7-day trial (≈ T-4). Reuses the
    // legacy trialT7EmailSentAt column (see FIELD map in
    // trial-countdown-emails.ts) to avoid a migration.
    await step.run("send-midtrial", async () => {
      const lower = new Date(now.getTime() + 3.5 * ONE_DAY_MS);
      const upper = new Date(now.getTime() + 4.5 * ONE_DAY_MS);
      const users = await prisma.user.findMany({
        where: {
          subscriptionStatus: "TRIAL",
          trialEndsAt: { gte: lower, lt: upper },
          trialT7EmailSentAt: null,
        },
        select: { id: true },
      });
      for (const u of users) {
        const r = await sendCountdownEmail(u.id, "trial_midtrial");
        if (r.sent) tally.trial_midtrial += 1;
      }
      return { count: tally.trial_midtrial, candidates: users.length };
    });

    // Urgency cohort — Day 5 on a 7-day trial (≈ T-2). Reuses the
    // legacy trialT3EmailSentAt column. The old T-1 "last day" email
    // is dropped in the 7-day cadence (it would land ~1 day after this).
    await step.run("send-urgency", async () => {
      const lower = new Date(now.getTime() + 1.5 * ONE_DAY_MS);
      const upper = new Date(now.getTime() + 2.5 * ONE_DAY_MS);
      const users = await prisma.user.findMany({
        where: {
          subscriptionStatus: "TRIAL",
          trialEndsAt: { gte: lower, lt: upper },
          trialT3EmailSentAt: null,
        },
        select: { id: true },
      });
      for (const u of users) {
        const r = await sendCountdownEmail(u.id, "trial_urgency");
        if (r.sent) tally.trial_urgency += 1;
      }
      return { count: tally.trial_urgency, candidates: users.length };
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
