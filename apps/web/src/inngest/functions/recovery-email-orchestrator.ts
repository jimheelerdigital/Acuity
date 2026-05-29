/**
 * Recovery Email Orchestrator
 *
 * Cron: every 15 minutes. Evaluates all users against 5 recovery email
 * conditions and sends the first applicable email per user per tick.
 *
 * Recovery emails target funnel drop-offs and early-activation gaps:
 * 1. checkout_abandoned — 30min after checkout start, no payment
 * 2. signup_no_checkout — 1hr after signup, never started checkout
 * 3. paid_no_app — 2hr after signup, has subscription but no recording
 * 4. recorded_once — 48hr after first recording, only 1 entry
 * 5. day6_nudge — Saturday, 3+ recordings, weekly report coming tomorrow
 *
 * Deduplication: reuses TrialEmailLog (userId, emailKey) unique constraint
 * via sendTrialEmail(). Each recovery email can only be sent once per user.
 *
 * Throttle: 24h global cooldown — won't send any recovery email if the user
 * received ANY trial/recovery email in the last 24 hours.
 */

import { inngest } from "@/inngest/client";
import type { TrialEmailKey } from "@/emails/trial/types";

export const recoveryEmailOrchestratorFn = inngest.createFunction(
  { id: "recovery-email-orchestrator", concurrency: { limit: 1 } },
  { cron: "*/15 * * * *" },
  async ({ step }) => {
    const stats = await step.run("evaluate-and-send", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { sendTrialEmail } = await import("@/lib/trial-emails");

      const now = new Date();
      let sent = 0;
      let skipped = 0;
      let throttled = 0;

      // ── Helper: check 24h global throttle ──
      async function isThrottled(userId: string): Promise<boolean> {
        const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const recent = await prisma.trialEmailLog.findFirst({
          where: { userId, sentAt: { gte: cutoff } },
          select: { id: true },
        });
        return !!recent;
      }

      // ── Helper: check if user has a specific onboarding event ──
      async function hasEvent(
        userId: string,
        event: string
      ): Promise<boolean> {
        const row = await prisma.onboardingEvent.findFirst({
          where: { userId, event },
          select: { id: true },
        });
        return !!row;
      }

      // ── Helper: get timestamp of an onboarding event ──
      async function eventTime(
        userId: string,
        event: string
      ): Promise<Date | null> {
        const row = await prisma.onboardingEvent.findFirst({
          where: { userId, event },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        });
        return row?.createdAt ?? null;
      }

      // ── Helper: try to send, respecting throttle ──
      async function trySend(
        userId: string,
        emailKey: TrialEmailKey
      ): Promise<boolean> {
        if (await isThrottled(userId)) {
          throttled++;
          return false;
        }
        const result = await sendTrialEmail(userId, emailKey);
        if (result.sent) {
          sent++;
          return true;
        }
        skipped++;
        return false;
      }

      // ═══════════════════════════════════════════════════════════
      // 1. CHECKOUT ABANDONED
      //    Users who started checkout 30min–2hr ago, no payment
      // ═══════════════════════════════════════════════════════════
      const checkoutWindow = {
        gte: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        lte: new Date(now.getTime() - 30 * 60 * 1000),
      };

      const checkoutAbandoned = await prisma.onboardingEvent.findMany({
        where: {
          event: "funnel_checkout_started",
          createdAt: checkoutWindow,
          userId: { not: null },
        },
        select: { userId: true },
        distinct: ["userId"],
      });

      for (const row of checkoutAbandoned) {
        if (!row.userId) continue;
        // Verify no payment completed
        const paid = await hasEvent(row.userId, "funnel_payment_completed");
        if (paid) continue;
        // Verify user still exists and is in TRIAL (not already converted)
        const user = await prisma.user.findUnique({
          where: { id: row.userId },
          select: { subscriptionStatus: true, stripeSubscriptionId: true },
        });
        if (!user || user.stripeSubscriptionId) continue;
        await trySend(row.userId, "recovery_checkout_abandoned");
      }

      // ═══════════════════════════════════════════════════════════
      // 2. SIGNUP NO CHECKOUT
      //    Users who signed up 1hr–4hr ago, never started checkout
      // ═══════════════════════════════════════════════════════════
      const signupWindow = {
        gte: new Date(now.getTime() - 4 * 60 * 60 * 1000),
        lte: new Date(now.getTime() - 1 * 60 * 60 * 1000),
      };

      const signupNoCheckout = await prisma.onboardingEvent.findMany({
        where: {
          event: "funnel_signup_completed",
          createdAt: signupWindow,
          userId: { not: null },
        },
        select: { userId: true },
        distinct: ["userId"],
      });

      for (const row of signupNoCheckout) {
        if (!row.userId) continue;
        const didCheckout = await hasEvent(
          row.userId,
          "funnel_checkout_started"
        );
        if (didCheckout) continue;
        await trySend(row.userId, "recovery_signup_no_checkout");
      }

      // ═══════════════════════════════════════════════════════════
      // 3. PAID BUT NEVER OPENED APP
      //    Active subscription, no recordings, created 2hr–24hr ago
      // ═══════════════════════════════════════════════════════════
      const paidNoApp = await prisma.user.findMany({
        where: {
          subscriptionStatus: { in: ["PRO", "TRIALING"] },
          firstRecordingAt: null,
          createdAt: {
            gte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
            lte: new Date(now.getTime() - 2 * 60 * 60 * 1000),
          },
        },
        select: { id: true },
      });

      for (const user of paidNoApp) {
        await trySend(user.id, "recovery_paid_no_app");
      }

      // ═══════════════════════════════════════════════════════════
      // 4. RECORDED ONCE, NEVER RETURNED
      //    1 recording, first recording 48hr–96hr ago
      // ═══════════════════════════════════════════════════════════
      const recordedOnce = await prisma.user.findMany({
        where: {
          totalRecordings: 1,
          firstRecordingAt: {
            gte: new Date(now.getTime() - 96 * 60 * 60 * 1000),
            lte: new Date(now.getTime() - 48 * 60 * 60 * 1000),
          },
        },
        select: { id: true },
      });

      for (const user of recordedOnce) {
        await trySend(user.id, "recovery_recorded_once");
      }

      // ═══════════════════════════════════════════════════════════
      // 5. DAY 6 NUDGE (Saturday pre-weekly-report)
      //    3+ recordings, created 5–7 days ago, today is Saturday
      // ═══════════════════════════════════════════════════════════
      const dayOfWeek = now.getUTCDay(); // 0=Sun, 6=Sat
      if (dayOfWeek === 6) {
        const day6Users = await prisma.user.findMany({
          where: {
            totalRecordings: { gte: 3 },
            createdAt: {
              gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
              lte: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
            },
          },
          select: { id: true },
        });

        for (const user of day6Users) {
          await trySend(user.id, "recovery_day6_nudge");
        }
      }

      return { sent, skipped, throttled };
    });

    return stats;
  }
);
