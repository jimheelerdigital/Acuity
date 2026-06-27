/**
 * On-demand first-insight generator + email sender.
 *
 * Trigger: event "first-insight/generate.requested" — emitted by
 * process-entry when a user's 5th completed recording finishes.
 *
 * Flow:
 *   1. Cost guard — bail if the user already received the email, already
 *      has a UserInsight, or isn't on TRIAL/ACTIVE/PRO.
 *   2. Generate insight — reuses the SAME collectSignals + buildDigest +
 *      synthesizeWithClaude pipeline from compute-user-insights (the
 *      weekly Sunday cron). One source of truth for insight quality.
 *   3. Send the "first_insight" email via sendTrialEmail, which enforces
 *      the TrialEmailLog dedup, kill-switch, and unsubscribe checks.
 *
 * Cost guard matters: the Opus synthesis call is the most expensive step.
 * We check TrialEmailLog + UserInsight BEFORE spending the call. If either
 * exists, we skip — the user either already got the email or the weekly
 * cron already generated insights that the recovery orchestrator will pick
 * up on its next 15-min tick.
 *
 * Concurrency: 1 per user so parallel recordings (unlikely but possible)
 * don't double-generate.
 */

import { CLAUDE_FLAGSHIP_MODEL } from "@acuity/shared";

import { inngest } from "@/inngest/client";
import {
  collectSignals,
  buildDigest,
  synthesizeWithClaude,
  weekStartOf,
} from "@/inngest/functions/compute-user-insights";

type FirstInsightEventData = {
  userId: string;
};

export const generateFirstInsightFn = inngest.createFunction(
  {
    id: "generate-first-insight",
    name: "Generate first insight + send activation email",
    triggers: [{ event: "first-insight/generate.requested" }],
    retries: 2,
    concurrency: { key: "event.data.userId", limit: 1 },
  },
  async ({ event, step, logger }) => {
    const { userId } = event.data as FirstInsightEventData;

    // ── Step 1: Cost guard ──────────────────────────────────────────
    const eligible = await step.run("cost-guard", async () => {
      const { prisma } = await import("@/lib/prisma");

      // Already sent?
      const alreadySent = await prisma.trialEmailLog.findUnique({
        where: { userId_emailKey: { userId, emailKey: "first_insight" } },
        select: { id: true },
      });
      if (alreadySent) return { skip: true, reason: "already_sent" as const };

      // Already has a UserInsight? (weekly cron beat us)
      const existingInsight = await prisma.userInsight.findFirst({
        where: { userId, dismissedAt: null },
        select: { id: true },
      });
      if (existingInsight) return { skip: false, reason: "has_insight" as const };

      // Subscription check
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { subscriptionStatus: true, totalRecordings: true },
      });
      if (!user) return { skip: true, reason: "no_user" as const };
      if (!["TRIAL", "ACTIVE", "PRO"].includes(user.subscriptionStatus ?? "")) {
        return { skip: true, reason: "not_eligible_tier" as const };
      }
      if ((user.totalRecordings ?? 0) < 5) {
        return { skip: true, reason: "not_enough_recordings" as const };
      }

      return { skip: false, reason: "needs_generation" as const };
    });

    if (eligible.skip) {
      logger.info(`generate-first-insight: skipped for ${userId} (${eligible.reason})`);
      return { userId, skipped: true, reason: eligible.reason };
    }

    // ── Step 2: Generate insight (if needed) ────────────────────────
    // If the user already has a UserInsight from the weekly cron
    // (reason === "has_insight"), skip generation — go straight to send.
    if (eligible.reason === "needs_generation") {
      await step.run("generate-insight", async () => {
        const { prisma } = await import("@/lib/prisma");

        const now = new Date();
        const thisWeekStart = weekStartOf(now);
        const lastWeekStart = new Date(thisWeekStart);
        lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);
        const twoWeeksAgo = new Date(lastWeekStart);
        twoWeeksAgo.setUTCDate(twoWeeksAgo.getUTCDate() - 7);
        const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

        const signals = await collectSignals(prisma as Parameters<typeof collectSignals>[0], {
          userId,
          thisWeekStart,
          lastWeekStart,
          twoWeeksAgo,
        });

        const digest = await buildDigest(
          prisma as Parameters<typeof buildDigest>[0],
          userId,
          fourteenDaysAgo
        );

        const claudeObs = await synthesizeWithClaude({ signals, digest }).catch(
          (err) => {
            logger.warn(
              `generate-first-insight: Claude failed for ${userId}: ${String(err)}`
            );
            return null;
          }
        );

        type Severity = "POSITIVE" | "NEUTRAL" | "CONCERNING";

        let toWrite: Array<{
          observationText: string;
          severity: Severity;
          linkedAreaId: string | null;
          generationModel: string;
        }>;

        if (claudeObs && claudeObs.length > 0) {
          toWrite = claudeObs.map((o) => ({
            observationText: o.text,
            severity: o.severity as Severity,
            linkedAreaId: o.linkedAreaId,
            generationModel: CLAUDE_FLAGSHIP_MODEL,
          }));
        } else {
          // Heuristic fallback
          toWrite = signals.slice(0, 3).map((s) => ({
            observationText: s.heuristicText,
            severity: s.severity as Severity,
            linkedAreaId: s.linkedAreaId ?? null,
            generationModel: "heuristic",
          }));
        }

        if (toWrite.length === 0) {
          logger.info(`generate-first-insight: no observations for ${userId}`);
          return;
        }

        // Dedupe against recent rows
        const recencyCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const recent = await prisma.userInsight.findMany({
          where: { userId, createdAt: { gte: recencyCutoff } },
          select: { observationText: true },
        });
        const recentTexts = new Set(recent.map((r) => r.observationText));
        const fresh = toWrite.filter((o) => !recentTexts.has(o.observationText));
        if (fresh.length === 0) return;

        await prisma.userInsight.createMany({
          data: fresh.map((o) => ({
            userId,
            observationText: o.observationText,
            severity: o.severity,
            linkedAreaId: o.linkedAreaId,
            generationModel: o.generationModel,
          })),
        });

        logger.info(`generate-first-insight: wrote ${fresh.length} insights for ${userId}`);
      });
    }

    // ── Step 3: Send the email ──────────────────────────────────────
    const sendResult = await step.run("send-email", async () => {
      const { prisma } = await import("@/lib/prisma");

      // Final gate: confirm a real UserInsight exists now
      const insight = await prisma.userInsight.findFirst({
        where: { userId, dismissedAt: null },
        select: { id: true },
      });
      if (!insight) {
        return { sent: false, reason: "no_insight_after_generation" };
      }

      const { sendTrialEmail } = await import("@/lib/trial-emails");
      return sendTrialEmail(userId, "first_insight");
    });

    return { userId, sendResult };
  }
);
