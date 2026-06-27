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
  {
    id: "recovery-email-orchestrator",
    name: "Recovery email orchestrator",
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

      // ═══════════════════════════════════════════════════════════
      // 13–16. NEVER RECORDED — escalating sequence to drive first debrief
      //    TRIAL users with totalRecordings = 0. THE CANCEL RULE: if the
      //    user has recorded ANY debrief (totalRecordings > 0), skip ALL
      //    remaining emails in this sequence. The totalRecordings = 0
      //    check on every condition IS the cancel rule — the moment a
      //    recording completes and increments totalRecordings, all future
      //    conditions fail to match.
      //
      //    Emails 1 & 2 (24h, 48h): ALL trial users with 0 recordings.
      //    Emails 3 & 4 (3-day, lastday): ONLY no-card/no-paid users.
      // ═══════════════════════════════════════════════════════════

      // #13 — NEVER RECORDED 24h
      //    Created 20–48h ago (wide window for 15-min cron), TRIAL, 0 recordings.
      const neverRecorded24hCandidates = await prisma.user.findMany({
        where: {
          subscriptionStatus: "TRIAL",
          totalRecordings: 0,
          createdAt: {
            gte: new Date(now.getTime() - 48 * 60 * 60 * 1000),
            lte: new Date(now.getTime() - 20 * 60 * 60 * 1000),
          },
        },
        select: { id: true },
      });

      for (const user of neverRecorded24hCandidates) {
        await trySend(user.id, "never_recorded_24h");
      }

      // #14 — NEVER RECORDED 48h
      //    Created 44–96h ago, TRIAL, 0 recordings.
      const neverRecorded48hCandidates = await prisma.user.findMany({
        where: {
          subscriptionStatus: "TRIAL",
          totalRecordings: 0,
          createdAt: {
            gte: new Date(now.getTime() - 96 * 60 * 60 * 1000),
            lte: new Date(now.getTime() - 44 * 60 * 60 * 1000),
          },
        },
        select: { id: true },
      });

      for (const user of neverRecorded48hCandidates) {
        await trySend(user.id, "never_recorded_48h");
      }

      // #15 — NEVER RECORDED 3 DAYS LEFT (no-card only)
      //    trialEndsAt 48–96h from now, TRIAL, 0 recordings, no card on file.
      const neverRecorded3dayCandidates = await prisma.user.findMany({
        where: {
          subscriptionStatus: "TRIAL",
          totalRecordings: 0,
          trialEndsAt: {
            gte: new Date(now.getTime() + 48 * 60 * 60 * 1000),
            lt: new Date(now.getTime() + 96 * 60 * 60 * 1000),
          },
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          appleOriginalTransactionId: null,
        },
        select: { id: true },
      });

      for (const user of neverRecorded3dayCandidates) {
        await trySend(user.id, "never_recorded_3day");
      }

      // #16 — NEVER RECORDED LAST DAY (no-card only)
      //    trialEndsAt within 0–36h from now, TRIAL, 0 recordings, no card on file.
      const neverRecordedLastdayCandidates = await prisma.user.findMany({
        where: {
          subscriptionStatus: "TRIAL",
          totalRecordings: 0,
          trialEndsAt: {
            gte: now,
            lt: new Date(now.getTime() + 36 * 60 * 60 * 1000),
          },
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          appleOriginalTransactionId: null,
        },
        select: { id: true },
      });

      for (const user of neverRecordedLastdayCandidates) {
        await trySend(user.id, "never_recorded_lastday");
      }

      // ═══════════════════════════════════════════════════════════
      // 9–12. DOWNLOAD RESCUE — four stage-specific emails
      //    ALL gated on appFirstOpenedAt IS NULL (never opened app).
      //    Mutual exclusivity: each user gets ONE email matching their
      //    furthest/most-specific stage. Priority: webview-blocked (4)
      //    > tapped-app-store (3) > viewed-download (2) > signup-only (1).
      //    Timing: created 2–48 hours ago (matches old download-reminder
      //    cadence but wider window for the 15-min cron to catch everyone).
      // ═══════════════════════════════════════════════════════════
      const rescueWindow = {
        gte: new Date(now.getTime() - 48 * 60 * 60 * 1000),
        lte: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      };

      // Candidates: signed up 2–48h ago, never opened the app.
      const rescueCandidates = await prisma.user.findMany({
        where: {
          createdAt: rescueWindow,
          appFirstOpenedAt: null,
        },
        select: { id: true },
      });

      // Download-step events for all candidates in one query.
      const rescueUserIds = rescueCandidates.map((u) => u.id);
      const rescueEvents =
        rescueUserIds.length > 0
          ? await prisma.onboardingEvent.findMany({
              where: {
                userId: { in: rescueUserIds },
                event: {
                  in: [
                    "funnel_download_screen_viewed",
                    "funnel_app_store_clicked",
                    "funnel_inapp_browser_detected",
                  ],
                },
              },
              select: { userId: true, event: true },
            })
          : [];

      // Build per-user event sets.
      const userEvents = new Map<string, Set<string>>();
      for (const e of rescueEvents) {
        if (!e.userId) continue;
        if (!userEvents.has(e.userId)) userEvents.set(e.userId, new Set());
        userEvents.get(e.userId)!.add(e.event);
      }

      for (const user of rescueCandidates) {
        const events = userEvents.get(user.id) ?? new Set<string>();

        // Priority: most-specific wins → exactly one email per user.
        let emailKey: TrialEmailKey;
        let replyTo: string | undefined;

        if (events.has("funnel_inapp_browser_detected")) {
          // #4 — Webview blocked (highest priority)
          emailKey = "rescue_webview_blocked";
        } else if (events.has("funnel_app_store_clicked")) {
          // #3 — Tapped App Store, never opened
          emailKey = "rescue_tapped_app_store";
        } else if (events.has("funnel_download_screen_viewed")) {
          // #2 — Viewed download, no tap
          emailKey = "rescue_viewed_no_tap";
          replyTo = "keenan@getacuity.io";
        } else {
          // #1 — Signed up only (lowest priority)
          emailKey = "rescue_signup_only";
        }

        if (await isThrottled(user.id)) {
          throttled++;
          continue;
        }
        const result = await sendTrialEmail(user.id, emailKey, { replyTo });
        if (result.sent) {
          sent++;
        } else {
          skipped++;
        }
      }

      // ═══════════════════════════════════════════════════════════
      // 8. TRIAL ENDING — 2 days before trialEndsAt
      //    Active trial, has recorded at least 1 debrief, NOT paid,
      //    no card/payment method on file. Fires once per user.
      //    Fail-safe: if payment status is ambiguous (stripeCustomerId
      //    is set but subscriptionStatus is TRIAL), do NOT email.
      // ═══════════════════════════════════════════════════════════
      const trialEndingWindow = {
        // trialEndsAt between 24h and 72h from now → "~2 days left"
        gte: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        lt: new Date(now.getTime() + 72 * 60 * 60 * 1000),
      };

      const trialEndingCandidates = await prisma.user.findMany({
        where: {
          subscriptionStatus: "TRIAL",
          trialEndsAt: trialEndingWindow,
          totalRecordings: { gte: 1 },
          // No payment on ANY platform — fail-safe: exclude anyone
          // who has ever interacted with a payment system.
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          appleOriginalTransactionId: null,
        },
        select: { id: true },
      });

      for (const user of trialEndingCandidates) {
        await trySend(user.id, "trial_ending");
      }

      // ═══════════════════════════════════════════════════════════
      // 7. KEEP MOMENTUM — early encouragement at 2 recordings
      //    2–4 completed recordings, first recording 48hr+ ago.
      //    Skipped if user is already at 5+ recordings (the
      //    first_insight email handles that stage). No CTA — pure
      //    encouragement. Fires once per user via TrialEmailLog dedup.
      // ═══════════════════════════════════════════════════════════
      const keepMomentumCandidates = await prisma.user.findMany({
        where: {
          totalRecordings: { gte: 2, lt: 5 },
          firstRecordingAt: {
            lte: new Date(now.getTime() - 48 * 60 * 60 * 1000),
          },
        },
        select: { id: true },
      });

      for (const user of keepMomentumCandidates) {
        await trySend(user.id, "keep_momentum");
      }

      // ═══════════════════════════════════════════════════════════
      // 6. FIRST INSIGHT — activation email at ~5 recordings
      //    5+ completed recordings AND a real UserInsight exists.
      //    Fires once per user (dedup via TrialEmailLog).
      //    The insight is pulled in buildTrialVars and rendered by
      //    the template — orchestrator just gates on existence.
      // ═══════════════════════════════════════════════════════════
      const firstInsightCandidates = await prisma.user.findMany({
        where: {
          totalRecordings: { gte: 5 },
          subscriptionStatus: { in: ["TRIAL", "ACTIVE", "PRO"] },
        },
        select: { id: true },
      });

      for (const user of firstInsightCandidates) {
        // Only send if a real UserInsight observation exists — never
        // fabricate. If the weekly insights cron hasn't run yet for
        // this user, skip them; they'll be picked up on a future tick.
        const hasInsight = await prisma.userInsight.findFirst({
          where: { userId: user.id, dismissedAt: null },
          select: { id: true },
        });
        if (!hasInsight) continue;
        await trySend(user.id, "first_insight");
      }

      return { sent, skipped, throttled };
    });

    return stats;
  }
);
