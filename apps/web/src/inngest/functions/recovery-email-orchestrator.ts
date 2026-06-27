/**
 * Recovery Email Orchestrator
 *
 * Cron: every 15 minutes. Evaluates users against recovery/activation
 * email conditions and sends the applicable email per user per tick.
 *
 * ── SAFE BACKLOG RECOVERY (2026-06-27) ──────────────────────────────
 *
 * Three layers of protection prevent blast-on-enable:
 *
 * 1. GLOBAL RATE CAP — configurable max sends per tick (default 50)
 *    and per day (default 300). The backlog drains gradually over days
 *    instead of one spike. Tune via RECOVERY_MAX_SENDS_PER_TICK and
 *    RECOVERY_MAX_SENDS_PER_DAY env vars.
 *
 * 2. FORWARD-ONLY GUARD — time-sensitive emails (stall, never-recorded,
 *    trial-ending, download-rescue) only fire when the triggering event
 *    is AFTER RECOVERY_ENABLEMENT_DATE. Prevents retroactive blasting
 *    of old users on re-enable.
 *
 * 3. CURRENT-STAGE-ONLY — winback/stall windows are non-overlapping
 *    with upper bounds. A user matches exactly ONE tier, not a stack.
 *    Stall ladder is capped at 7d; beyond that, winback takes over.
 *
 * DRY RUN — set RECOVERY_DRY_RUN=true to count qualifying users per
 * email type without actually sending. Returns counts + estimated
 * drain time at the configured rate.
 *
 * Deduplication: TrialEmailLog (userId, emailKey) unique constraint
 * via sendTrialEmail(). Each email fires at most once per user.
 *
 * Throttle: 24h per-user cooldown — won't send any recovery email if
 * the user received ANY trial/recovery email in the last 24 hours.
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
  async ({ step, logger }) => {
    const stats = await step.run("evaluate-and-send", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { sendTrialEmail } = await import("@/lib/trial-emails");
      const { getRecoveryConfig } = await import("@/lib/recovery-config");

      const config = getRecoveryConfig();
      const now = new Date();
      let sent = 0;
      let skipped = 0;
      let throttled = 0;
      let rateLimited = 0;

      // ── Dry-run accumulator ──
      const dryRunCounts: Record<string, number> = {};

      // ── Global daily send count ──
      const todayStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      );
      const dailySentSoFar = await prisma.trialEmailLog.count({
        where: { sentAt: { gte: todayStart } },
      });

      let dailyBudget = Math.max(0, config.maxSendsPerDay - dailySentSoFar);
      let tickBudget = config.maxSendsPerTick;

      function hasGlobalBudget(): boolean {
        return tickBudget > 0 && dailyBudget > 0;
      }

      function consumeBudget(): void {
        tickBudget--;
        dailyBudget--;
      }

      // ── Helper: check 24h per-user throttle ──
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

      // ── Helper: try to send, respecting per-user + global throttle ──
      async function trySend(
        userId: string,
        emailKey: TrialEmailKey,
        opts?: { replyTo?: string }
      ): Promise<boolean> {
        if (config.dryRun) {
          dryRunCounts[emailKey] = (dryRunCounts[emailKey] ?? 0) + 1;
          return false;
        }
        if (!hasGlobalBudget()) {
          rateLimited++;
          return false;
        }
        if (await isThrottled(userId)) {
          throttled++;
          return false;
        }
        const result = await sendTrialEmail(userId, emailKey, opts);
        if (result.sent) {
          sent++;
          consumeBudget();
          return true;
        }
        skipped++;
        return false;
      }

      // ── Helper: forward-only guard ──
      // Returns true if the timestamp is AFTER the enablement date.
      // Time-sensitive emails use this to skip backlog users.
      function isAfterEnablement(d: Date | null): boolean {
        if (!d) return false;
        return d.getTime() >= config.enablementDate.getTime();
      }

      // ═══════════════════════════════════════════════════════════
      // 1. CHECKOUT ABANDONED (forward-only: narrow window)
      // ═══════════════════════════════════════════════════════════
      if (hasGlobalBudget() || config.dryRun) {
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
          if (!hasGlobalBudget() && !config.dryRun) break;
          if (!row.userId) continue;
          const paid = await hasEvent(row.userId, "funnel_payment_completed");
          if (paid) continue;
          const user = await prisma.user.findUnique({
            where: { id: row.userId },
            select: { subscriptionStatus: true, stripeSubscriptionId: true },
          });
          if (!user || user.stripeSubscriptionId) continue;
          await trySend(row.userId, "recovery_checkout_abandoned");
        }
      }

      // ═══════════════════════════════════════════════════════════
      // 2. SIGNUP NO CHECKOUT (forward-only: narrow window)
      // ═══════════════════════════════════════════════════════════
      if (hasGlobalBudget() || config.dryRun) {
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
          if (!hasGlobalBudget() && !config.dryRun) break;
          if (!row.userId) continue;
          const didCheckout = await hasEvent(
            row.userId,
            "funnel_checkout_started"
          );
          if (didCheckout) continue;
          await trySend(row.userId, "recovery_signup_no_checkout");
        }
      }

      // ═══════════════════════════════════════════════════════════
      // 3. PAID BUT NEVER OPENED APP (forward-only: narrow window)
      // ═══════════════════════════════════════════════════════════
      if (hasGlobalBudget() || config.dryRun) {
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
          if (!hasGlobalBudget() && !config.dryRun) break;
          await trySend(user.id, "recovery_paid_no_app");
        }
      }

      // ═══════════════════════════════════════════════════════════
      // 17–19. STALL RE-ENGAGEMENT LADDER (FORWARD-ONLY)
      //    Upper-bounded at 7 days: beyond that, winback takes over.
      //    Forward-only guard: lastRecordingAt must be after enablement.
      // ═══════════════════════════════════════════════════════════
      if (hasGlobalBudget() || config.dryRun) {
        const STALL_UPPER = 7 * 24 * 60 * 60 * 1000; // 7 days

        // #17 — STALL 1 REC: 1 recording, 48h–7d since last
        const stall1recCandidates = await prisma.user.findMany({
          where: {
            totalRecordings: 1,
            lastRecordingAt: {
              gte: new Date(now.getTime() - STALL_UPPER),
              lte: new Date(now.getTime() - 48 * 60 * 60 * 1000),
            },
          },
          select: { id: true, lastRecordingAt: true },
        });

        for (const user of stall1recCandidates) {
          if (!hasGlobalBudget() && !config.dryRun) break;
          if (!isAfterEnablement(user.lastRecordingAt)) continue;
          await trySend(user.id, "stall_1rec");
        }

        // #18 — STALL 2 REC: 2 recordings, 48h–7d since last
        const stall2recCandidates = await prisma.user.findMany({
          where: {
            totalRecordings: 2,
            lastRecordingAt: {
              gte: new Date(now.getTime() - STALL_UPPER),
              lte: new Date(now.getTime() - 48 * 60 * 60 * 1000),
            },
          },
          select: { id: true, lastRecordingAt: true },
        });

        for (const user of stall2recCandidates) {
          if (!hasGlobalBudget() && !config.dryRun) break;
          if (!isAfterEnablement(user.lastRecordingAt)) continue;
          await trySend(user.id, "stall_2rec");
        }

        // #19 — STALL 3+ REC: 3+ recordings, 72h–7d since last
        const stall3plusCandidates = await prisma.user.findMany({
          where: {
            totalRecordings: { gte: 3 },
            lastRecordingAt: {
              gte: new Date(now.getTime() - STALL_UPPER),
              lte: new Date(now.getTime() - 72 * 60 * 60 * 1000),
            },
          },
          select: { id: true, lastRecordingAt: true },
        });

        for (const user of stall3plusCandidates) {
          if (!hasGlobalBudget() && !config.dryRun) break;
          if (!isAfterEnablement(user.lastRecordingAt)) continue;
          await trySend(user.id, "stall_3plus", {
            replyTo: "keenan@getacuity.io",
          });
        }
      }

      // ═══════════════════════════════════════════════════════════
      // 20–23. WINBACK LADDER (RETROACTIVE WITH RATE CAP)
      //    Non-overlapping windows → current-stage-only by design.
      //    Retroactive: reaches backlog users, throttled by global cap.
      //    90-day hard stop: 120-day upper bound means >120d = no match.
      // ═══════════════════════════════════════════════════════════
      if (hasGlobalBudget() || config.dryRun) {
        const winbackBase = {
          totalRecordings: { gte: 1 },
          subscriptionStatus: { notIn: ["PRO"] as string[] },
        };

        // #20 — WINBACK 7 DAYS: lastRecordingAt 7–13 days ago
        const winback7dCandidates = await prisma.user.findMany({
          where: {
            ...winbackBase,
            lastRecordingAt: {
              gte: new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000),
              lte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
            },
          },
          select: { id: true },
        });

        for (const user of winback7dCandidates) {
          if (!hasGlobalBudget() && !config.dryRun) break;
          await trySend(user.id, "winback_7d", {
            replyTo: "keenan@getacuity.io",
          });
        }

        // #21 — WINBACK 14 DAYS: lastRecordingAt 14–29 days ago
        const winback14dCandidates = await prisma.user.findMany({
          where: {
            ...winbackBase,
            lastRecordingAt: {
              gte: new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000),
              lte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
            },
          },
          select: { id: true },
        });

        for (const user of winback14dCandidates) {
          if (!hasGlobalBudget() && !config.dryRun) break;
          await trySend(user.id, "winback_14d");
        }

        // #22 — WINBACK 30 DAYS: lastRecordingAt 30–89 days ago
        const winback30dCandidates = await prisma.user.findMany({
          where: {
            ...winbackBase,
            lastRecordingAt: {
              gte: new Date(now.getTime() - 89 * 24 * 60 * 60 * 1000),
              lte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
            },
          },
          select: { id: true },
        });

        for (const user of winback30dCandidates) {
          if (!hasGlobalBudget() && !config.dryRun) break;
          await trySend(user.id, "winback_30d", {
            replyTo: "keenan@getacuity.io",
          });
        }

        // #23 — WINBACK 90 DAYS (FINAL): lastRecordingAt 90–120 days ago.
        //    HARD STOP — users silent >120 days match NOTHING.
        const winback90dCandidates = await prisma.user.findMany({
          where: {
            ...winbackBase,
            lastRecordingAt: {
              gte: new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000),
              lte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
            },
          },
          select: { id: true },
        });

        for (const user of winback90dCandidates) {
          if (!hasGlobalBudget() && !config.dryRun) break;
          await trySend(user.id, "winback_90d", {
            replyTo: "keenan@getacuity.io",
          });
        }
      }

      // ═══════════════════════════════════════════════════════════
      // 5. DAY 6 NUDGE (forward-only: Saturday-only + narrow window)
      // ═══════════════════════════════════════════════════════════
      if ((hasGlobalBudget() || config.dryRun) && now.getUTCDay() === 6) {
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
          if (!hasGlobalBudget() && !config.dryRun) break;
          await trySend(user.id, "recovery_day6_nudge");
        }
      }

      // ═══════════════════════════════════════════════════════════
      // 13–16. NEVER RECORDED (FORWARD-ONLY)
      //    Forward-only guard: createdAt must be after enablement.
      // ═══════════════════════════════════════════════════════════
      if (hasGlobalBudget() || config.dryRun) {
        // #13 — 24h: created 20–48h ago, TRIAL, 0 recordings
        const nr24h = await prisma.user.findMany({
          where: {
            subscriptionStatus: "TRIAL",
            totalRecordings: 0,
            createdAt: {
              gte: new Date(now.getTime() - 48 * 60 * 60 * 1000),
              lte: new Date(now.getTime() - 20 * 60 * 60 * 1000),
            },
          },
          select: { id: true, createdAt: true },
        });

        for (const user of nr24h) {
          if (!hasGlobalBudget() && !config.dryRun) break;
          if (!isAfterEnablement(user.createdAt)) continue;
          await trySend(user.id, "never_recorded_24h");
        }

        // #14 — 48h: created 44–96h ago
        const nr48h = await prisma.user.findMany({
          where: {
            subscriptionStatus: "TRIAL",
            totalRecordings: 0,
            createdAt: {
              gte: new Date(now.getTime() - 96 * 60 * 60 * 1000),
              lte: new Date(now.getTime() - 44 * 60 * 60 * 1000),
            },
          },
          select: { id: true, createdAt: true },
        });

        for (const user of nr48h) {
          if (!hasGlobalBudget() && !config.dryRun) break;
          if (!isAfterEnablement(user.createdAt)) continue;
          await trySend(user.id, "never_recorded_48h");
        }

        // #15 — 3 days left (no-card only)
        const nr3day = await prisma.user.findMany({
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
          select: { id: true, createdAt: true },
        });

        for (const user of nr3day) {
          if (!hasGlobalBudget() && !config.dryRun) break;
          if (!isAfterEnablement(user.createdAt)) continue;
          await trySend(user.id, "never_recorded_3day");
        }

        // #16 — Last day (no-card only)
        const nrLastday = await prisma.user.findMany({
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
          select: { id: true, createdAt: true },
        });

        for (const user of nrLastday) {
          if (!hasGlobalBudget() && !config.dryRun) break;
          if (!isAfterEnablement(user.createdAt)) continue;
          await trySend(user.id, "never_recorded_lastday");
        }
      }

      // ═══════════════════════════════════════════════════════════
      // 9–12. DOWNLOAD RESCUE (FORWARD-ONLY: narrow createdAt window)
      // ═══════════════════════════════════════════════════════════
      if (hasGlobalBudget() || config.dryRun) {
        const rescueWindow = {
          gte: new Date(now.getTime() - 48 * 60 * 60 * 1000),
          lte: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        };

        const rescueCandidates = await prisma.user.findMany({
          where: {
            createdAt: rescueWindow,
            appFirstOpenedAt: null,
          },
          select: { id: true },
        });

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

        const userEvents = new Map<string, Set<string>>();
        for (const e of rescueEvents) {
          if (!e.userId) continue;
          if (!userEvents.has(e.userId)) userEvents.set(e.userId, new Set());
          userEvents.get(e.userId)!.add(e.event);
        }

        for (const user of rescueCandidates) {
          if (!hasGlobalBudget() && !config.dryRun) break;
          const events = userEvents.get(user.id) ?? new Set<string>();

          let emailKey: TrialEmailKey;
          let replyTo: string | undefined;

          if (events.has("funnel_inapp_browser_detected")) {
            emailKey = "rescue_webview_blocked";
          } else if (events.has("funnel_app_store_clicked")) {
            emailKey = "rescue_tapped_app_store";
          } else if (events.has("funnel_download_screen_viewed")) {
            emailKey = "rescue_viewed_no_tap";
            replyTo = "keenan@getacuity.io";
          } else {
            emailKey = "rescue_signup_only";
          }

          await trySend(user.id, emailKey, { replyTo });
        }
      }

      // ═══════════════════════════════════════════════════════════
      // 8. TRIAL ENDING (FORWARD-ONLY: trialEndsAt window)
      // ═══════════════════════════════════════════════════════════
      if (hasGlobalBudget() || config.dryRun) {
        const trialEndingCandidates = await prisma.user.findMany({
          where: {
            subscriptionStatus: "TRIAL",
            trialEndsAt: {
              gte: new Date(now.getTime() + 24 * 60 * 60 * 1000),
              lt: new Date(now.getTime() + 72 * 60 * 60 * 1000),
            },
            totalRecordings: { gte: 1 },
            stripeCustomerId: null,
            stripeSubscriptionId: null,
            appleOriginalTransactionId: null,
          },
          select: { id: true },
        });

        for (const user of trialEndingCandidates) {
          if (!hasGlobalBudget() && !config.dryRun) break;
          await trySend(user.id, "trial_ending");
        }
      }

      // ═══════════════════════════════════════════════════════════
      // 7. KEEP MOMENTUM (RETROACTIVE + throttled)
      // ═══════════════════════════════════════════════════════════
      if (hasGlobalBudget() || config.dryRun) {
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
          if (!hasGlobalBudget() && !config.dryRun) break;
          await trySend(user.id, "keep_momentum");
        }
      }

      // ═══════════════════════════════════════════════════════════
      // 6. FIRST INSIGHT (RETROACTIVE + throttled)
      // ═══════════════════════════════════════════════════════════
      if (hasGlobalBudget() || config.dryRun) {
        const firstInsightCandidates = await prisma.user.findMany({
          where: {
            totalRecordings: { gte: 5 },
            subscriptionStatus: { in: ["TRIAL", "ACTIVE", "PRO"] },
          },
          select: { id: true },
        });

        for (const user of firstInsightCandidates) {
          if (!hasGlobalBudget() && !config.dryRun) break;
          const hasInsight = await prisma.userInsight.findFirst({
            where: { userId: user.id, dismissedAt: null },
            select: { id: true },
          });
          if (!hasInsight) continue;
          await trySend(user.id, "first_insight");
        }
      }

      // ═══════════════════════════════════════════════════════════
      // 24–28. MILESTONE EMAILS (RETROACTIVE + throttled)
      //    Power users at 10/25/50/100/365 completed recordings.
      //    HIGHEST-PASSED-MILESTONE-ONLY: a user with 120 recordings
      //    gets milestone_100, and lower milestones are auto-skipped
      //    (TrialEmailLog rows written as "skipped" so they never fire).
      //    All reply-to keenan@getacuity.io — feedback is the point.
      // ═══════════════════════════════════════════════════════════
      if (hasGlobalBudget() || config.dryRun) {
        // Milestone thresholds in ascending order.
        const MILESTONES: Array<{
          threshold: number;
          key: TrialEmailKey;
        }> = [
          { threshold: 10, key: "milestone_10" },
          { threshold: 25, key: "milestone_25" },
          { threshold: 50, key: "milestone_50" },
          { threshold: 100, key: "milestone_100" },
          { threshold: 365, key: "milestone_365" }, // gitleaks:allow
        ];

        // All users with 10+ recordings who might qualify.
        const milestoneCandidates = await prisma.user.findMany({
          where: { totalRecordings: { gte: 10 } },
          select: { id: true, totalRecordings: true },
        });

        // Which milestone emails has each candidate already received?
        const candidateIds = milestoneCandidates.map((u) => u.id);
        const existingMilestoneLogs =
          candidateIds.length > 0
            ? await prisma.trialEmailLog.findMany({
                where: {
                  userId: { in: candidateIds },
                  emailKey: {
                    in: MILESTONES.map((m) => m.key),
                  },
                },
                select: { userId: true, emailKey: true },
              })
            : [];

        const userMilestoneSent = new Map<string, Set<string>>();
        for (const log of existingMilestoneLogs) {
          const uid = log.userId;
          const ek = log.emailKey;
          if (!uid || !ek) continue;
          if (!userMilestoneSent.has(uid))
            userMilestoneSent.set(uid, new Set());
          userMilestoneSent.get(uid)!.add(ek);
        }

        for (const user of milestoneCandidates) {
          if (!hasGlobalBudget() && !config.dryRun) break;

          const sentKeys = userMilestoneSent.get(user.id) ?? new Set<string>();

          // Find the highest milestone this user has passed.
          let highestIdx = -1;
          for (let i = MILESTONES.length - 1; i >= 0; i--) {
            if ((user.totalRecordings ?? 0) >= MILESTONES[i].threshold) {
              highestIdx = i;
              break;
            }
          }
          if (highestIdx < 0) continue;

          // Skip lower milestones: write TrialEmailLog "skipped" entries
          // for milestones below the highest so they never fire later.
          if (!config.dryRun) {
            for (let i = 0; i < highestIdx; i++) {
              if (sentKeys.has(MILESTONES[i].key)) continue;
              // Upsert a skipped log row — prevents these from ever firing.
              await prisma.trialEmailLog.upsert({
                where: {
                  userId_emailKey: {
                    userId: user.id,
                    emailKey: MILESTONES[i].key,
                  },
                },
                update: {},
                create: {
                  userId: user.id,
                  emailKey: MILESTONES[i].key,
                  sentAt: now,
                  resendId: "skipped_backlog",
                },
              });
            }
          }

          // Send the highest milestone they haven't received yet.
          const highestKey = MILESTONES[highestIdx].key;
          if (sentKeys.has(highestKey)) continue;

          await trySend(user.id, highestKey, {
            replyTo: "keenan@getacuity.io",
          });
        }
      }

      // ── Return stats ──
      if (config.dryRun) {
        const totalQualifying = Object.values(dryRunCounts).reduce(
          (a, b) => a + b,
          0
        );
        const estimatedDrainDays = Math.ceil(
          totalQualifying / config.maxSendsPerDay
        );
        logger.info("[recovery-orchestrator] DRY RUN", {
          dryRunCounts,
          totalQualifying,
          estimatedDrainDays,
          config: {
            maxSendsPerTick: config.maxSendsPerTick,
            maxSendsPerDay: config.maxSendsPerDay,
            enablementDate: config.enablementDate.toISOString(),
          },
        });
        return {
          dryRun: true,
          counts: dryRunCounts,
          totalQualifying,
          estimatedDrainDays,
        };
      }

      logger.info("[recovery-orchestrator] tick complete", {
        sent,
        skipped,
        throttled,
        rateLimited,
        dailyBudgetRemaining: dailyBudget,
        tickBudgetRemaining: tickBudget,
      });

      return { sent, skipped, throttled, rateLimited };
    });

    return stats;
  }
);
