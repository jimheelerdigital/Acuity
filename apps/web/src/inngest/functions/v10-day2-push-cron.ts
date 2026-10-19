import { inngest } from "@/inngest/client";
import { DAY2_NUDGE_EMAIL_KEY, DAY2_NUDGE_EVENT, runDay2Nudge } from "@/lib/day2-nudge";
import { sendDay2Push } from "@/lib/v10-day2-push";

/**
 * Day-2 come-back nudge cron (v10 spec §9 Screen 9; email fallback added
 * 2026-10-18 per audit 2026-10-17 R-3, requested by Keenan).
 *
 * Hourly, because the send time is per-user local: someone who picked
 * "Morning" and someone who picked "Late" are eleven hours apart, and a
 * daily cron could only serve one of them.
 *
 * Push when the user has a device registered, otherwise ONE email. The
 * split and every skip rule live in lib/day2-nudge.ts (unit tested); this
 * file only wires the database and the senders in.
 *
 * ── Cohort ───────────────────────────────────────────────────────────
 * Every account aged 2–3 days. There is no flow-version filter: the v10
 * onboarding flag never gated who gets the nudge, only the copy's origin.
 *
 * ── Flag-gated, default OFF ──────────────────────────────────────────
 * ENABLE_V10_DAY2_PUSH must be "1". Parsed fail-closed: anything else,
 * including unset, means this function iterates nothing and sends nothing
 * — neither push nor email. A nudge cron is the least forgiving thing to
 * enable by accident; there is no unsend.
 */

const FLAG_ON = () => process.env.ENABLE_V10_DAY2_PUSH === "1";

export const v10Day2PushCronFn = inngest.createFunction(
  {
    id: "v10-day2-push-cron",
    name: "Day-2 nudge (push + email)",
    triggers: [{ cron: "0 * * * *" }],
    retries: 2,
    // Two overlapping runs would both pass the email throttle check before
    // either wrote a TrialEmailLog row; the unique constraint still stops
    // a double send, but one at a time keeps the stats honest.
    concurrency: { limit: 1 },
  },
  async ({ step, logger }) => {
    if (!FLAG_ON()) {
      logger.info("v10-day2-push: flag off, noop");
      return { skipped: true, push: 0, email: 0 };
    }

    const stats = await step.run("nudge", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { sendTrialEmail } = await import("@/lib/trial-emails");
      const { isInternalEmail } = await import("@/lib/internal-traffic");
      const now = new Date();
      const ONE_DAY = 24 * 60 * 60 * 1000;

      return runDay2Nudge({
        now,
        // Narrow in SQL to the 2–3 day age band so the per-user timezone
        // work runs over a small set. v10Day2PushSentAt is only ever
        // stamped by the push path, so emailed users reappear here each
        // hour until they age out; the email path's own checks (came
        // back / throttle / TrialEmailLog dedupe) make that a no-op.
        loadCandidates: () =>
          prisma.user.findMany({
            where: {
              v10Day2PushSentAt: null,
              createdAt: {
                gte: new Date(now.getTime() - 3 * ONE_DAY),
                lt: new Date(now.getTime() - 2 * ONE_DAY),
              },
            },
            select: {
              id: true,
              email: true,
              createdAt: true,
              timezone: true,
              notificationTime: true,
              pushToken: true,
            },
            // Bound the batch. An hour's cohort should be far smaller than
            // this; the cap stops one bad hour from becoming a runaway job.
            take: 500,
          }),
        sendPush: sendDay2Push,
        hasEntrySince: async (userId, since) =>
          (await prisma.entry.count({ where: { userId, createdAt: { gte: since } } })) > 0,
        hasEmailSince: async (userId, since) =>
          !!(await prisma.trialEmailLog.findFirst({
            where: { userId, sentAt: { gte: since } },
            select: { id: true },
          })),
        sendEmail: (userId) => sendTrialEmail(userId, DAY2_NUDGE_EMAIL_KEY),
        isInternalEmail,
        logSent: async (userId, channel) => {
          await prisma.onboardingEvent.create({
            data: { userId, event: DAY2_NUDGE_EVENT, value: channel },
          });
        },
      });
    });

    return stats;
  }
);
