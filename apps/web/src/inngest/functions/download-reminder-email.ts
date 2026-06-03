/**
 * Download Reminder Email
 *
 * Cron: every 15 minutes. Finds users who created an account 1–4 hours ago
 * but never clicked the App Store link or opened the app. Sends a single
 * recovery email with download links.
 *
 * Deduplication: User.downloadReminderSentAt column — only sends once.
 * Cancellation: if the user has a funnel_app_store_clicked or
 * funnel_download_viewed event, OR has opened the app (appFirstOpenedAt),
 * the email is skipped.
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

      // Users who created an account 1–4 hours ago, haven't downloaded,
      // and haven't already received this email.
      const candidates = await prisma.user.findMany({
        where: {
          createdAt: {
            gte: new Date(now.getTime() - 4 * 60 * 60 * 1000),
            lte: new Date(now.getTime() - 1 * 60 * 60 * 1000),
          },
          downloadReminderSentAt: null,
          onboardingUnsubscribed: false,
          // Only users who have NOT opened the app
          appFirstOpenedAt: null,
          email: { not: null },
        },
        select: { id: true, email: true },
      });

      for (const user of candidates) {
        if (!user.email) continue;

        // Check if user clicked App Store link or viewed download screen
        const downloaded = await prisma.onboardingEvent.findFirst({
          where: {
            userId: user.id,
            event: { in: ["funnel_app_store_clicked", "funnel_download_viewed", "funnel_download_screen_viewed"] },
          },
          select: { id: true },
        });

        if (downloaded) {
          skipped++;
          continue;
        }

        // Check 24h throttle — don't send if any email was sent recently
        const recentEmail = await prisma.trialEmailLog.findFirst({
          where: {
            userId: user.id,
            sentAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
          },
          select: { id: true },
        });
        if (recentEmail) {
          skipped++;
          continue;
        }

        try {
          const result = await sendTrialEmail(user.id, "recovery_download_reminder");
          if (result.sent) {
            // Stamp the user so this never fires again
            await prisma.user.update({
              where: { id: user.id },
              data: { downloadReminderSentAt: now },
            });
            sent++;
          } else {
            skipped++;
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
