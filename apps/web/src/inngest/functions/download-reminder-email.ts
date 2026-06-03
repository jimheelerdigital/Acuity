/**
 * Download Reminder Email
 *
 * Cron: every 15 minutes. Finds users who created an account 1–4 hours ago
 * but haven't opened the app or recorded a debrief. Sends a recovery email.
 *
 * Deduplication: User.downloadReminderSentAt column — only sends once.
 * Skip if: user opened the app (appFirstOpenedAt set) or has recordings.
 */

import { inngest } from "@/inngest/client";

export const downloadReminderEmailFn = inngest.createFunction(
  {
    id: "download-reminder-email",
    name: "Download reminder email (1hr post-signup)",
    triggers: [{ cron: "*/15 * * * *" }],
    concurrency: { limit: 1 },
    retries: 2,
  },
  async ({ step }) => {
    const stats = await step.run("evaluate-and-send", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { sendTrialEmail } = await import("@/lib/trial-emails");

      const now = new Date();
      let sent = 0;
      let skipped = 0;

      // Users who created an account 1–4 hours ago, haven't opened the app,
      // have no recordings, and haven't already received this email.
      const candidates = await prisma.user.findMany({
        where: {
          createdAt: {
            gte: new Date(now.getTime() - 4 * 60 * 60 * 1000),
            lte: new Date(now.getTime() - 1 * 60 * 60 * 1000),
          },
          downloadReminderSentAt: null,
          onboardingUnsubscribed: false,
          appFirstOpenedAt: null,
          firstRecordingAt: null,
        },
        select: { id: true, email: true },
      });

      for (const user of candidates) {
        if (!user.email) continue;
        // Skip founder/test accounts
        if (user.email.includes("heelerdigital.com")) continue;

        try {
          const result = await sendTrialEmail(user.id, "recovery_download_reminder");
          if (result.sent) {
            await prisma.user.update({
              where: { id: user.id },
              data: { downloadReminderSentAt: now },
            });
            sent++;
            console.log("[download-reminder] sent to", user.email);
          } else {
            skipped++;
            console.log("[download-reminder] skipped", user.email, result.reason);
          }
        } catch (err) {
          console.error("[download-reminder] send failed", {
            userId: user.id,
            error: err instanceof Error ? err.message : err,
          });
        }
      }

      console.log("[download-reminder] tick complete", {
        candidates: candidates.length,
        sent,
        skipped,
      });

      return { candidates: candidates.length, sent, skipped };
    });

    return stats;
  }
);
