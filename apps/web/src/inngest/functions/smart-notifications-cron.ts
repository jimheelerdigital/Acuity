import { inngest } from "@/inngest/client";
import {
  evaluateUser,
  type CandidateUser,
} from "@/lib/notifications/eligibility";
import { sendNotification } from "@/lib/notifications/send-notification-email";

/**
 * Smart-notifications scheduler (PR 2) — hourly cron.
 *
 * For each email-enabled user, evaluate the eligibility pipeline (quiet hours,
 * frequency caps, 18h floor, recorded-today, smart timing), pick the single
 * highest-priority candidate, and send a static-template email. Email-only;
 * default-ON categories only (streak / habit / milestone). Opt-in,
 * inferred-content categories light up in PR 3 behind the safety filter.
 *
 * Mirrors the existing hourly local-time-scan crons (notifications-twice-daily,
 * weekly-digest): fetch candidate IDs once, then reload + process each batch
 * inside its own step.run for timeout isolation. (Step return values are
 * JSON-serialized — Dates would become strings — so we return only IDs from
 * the fetch step and reload full rows, with real Date fields, in the batch.)
 *
 * Idempotency: NotificationLog's unique (userId, category, localDay). The 18h
 * gate is claimed atomically via a conditional updateMany on lastNotifiedAt
 * before each send.
 */

const BATCH_SIZE = 25;
const MIN_GAP_MS = 18 * 60 * 60 * 1000;

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  subscriptionStatus: true,
  currentStreak: true,
  timezone: true,
  notificationPreferences: {
    select: {
      emailEnabled: true,
      enabledCategories: true,
      tone: true,
      quietHoursStart: true,
      quietHoursEnd: true,
      timezone: true,
      maxPerDay: true,
      maxPerWeek: true,
      pausedUntil: true,
      lastNotifiedAt: true,
      preferredHourLocal: true,
    },
  },
} as const;

export const smartNotificationsCron = inngest.createFunction(
  {
    id: "smart-notifications-cron",
    name: "Smart notifications (email)",
    triggers: [{ cron: "0 * * * *" }],
    retries: 2,
  },
  async ({ step, logger }) => {
    const now = new Date();
    const cutoff18h = new Date(now.getTime() - MIN_GAP_MS);

    // Step 1: candidate IDs only (JSON-safe). Respect the global onboarding
    // unsubscribe AND the engagement-specific emailEnabled; finer gates run
    // per-user in the batch.
    const ids = await step.run("fetch-candidate-ids", async () => {
      const { prisma } = await import("@/lib/prisma");
      const rows = await prisma.user.findMany({
        where: {
          onboardingUnsubscribed: false,
          notificationPreferences: { is: { emailEnabled: true } },
        },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    });

    let sent = 0;
    const skips: Record<string, number> = {};
    const batchCount = Math.ceil(ids.length / BATCH_SIZE);

    for (let b = 0; b < batchCount; b++) {
      const batchIds = ids.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
      const res = await step.run(`process-batch-${b}`, async () => {
        const { prisma } = await import("@/lib/prisma");
        const users = await prisma.user.findMany({
          where: { id: { in: batchIds } },
          select: USER_SELECT,
        });

        let s = 0;
        const sk: Record<string, number> = {};
        for (const u of users) {
          if (!u.notificationPreferences) {
            sk["no_prefs"] = (sk["no_prefs"] ?? 0) + 1;
            continue;
          }
          const cu: CandidateUser = {
            id: u.id,
            email: u.email,
            name: u.name,
            subscriptionStatus: u.subscriptionStatus,
            currentStreak: u.currentStreak,
            timezone: u.timezone,
            prefs: u.notificationPreferences,
          };

          const decision = await evaluateUser(cu, now);
          if (decision.action === "skip") {
            sk[decision.reason] = (sk[decision.reason] ?? 0) + 1;
            continue;
          }

          // Atomic 18h claim (+ opportunistically cache the preferred hour).
          // count === 0 → another tick already claimed within 18h.
          const claim = await prisma.userNotificationPreferences.updateMany({
            where: {
              userId: u.id,
              OR: [
                { lastNotifiedAt: null },
                { lastNotifiedAt: { lt: cutoff18h } },
              ],
            },
            data: {
              lastNotifiedAt: now,
              ...(decision.storePreferredHour !== undefined
                ? { preferredHourLocal: decision.storePreferredHour }
                : {}),
            },
          });
          if (claim.count === 0) {
            sk["raced"] = (sk["raced"] ?? 0) + 1;
            continue;
          }

          const result = await sendNotification(cu, decision);
          if (result.sent) {
            s++;
          } else {
            const r = result.reason ?? "send_failed";
            sk[r] = (sk[r] ?? 0) + 1;
          }
        }
        return { s, sk };
      });

      sent += res.s;
      for (const [k, v] of Object.entries(res.sk)) {
        skips[k] = (skips[k] ?? 0) + v;
      }
    }

    logger.info("smart-notifications-cron complete", {
      candidates: ids.length,
      sent,
      skips,
    });
    return { candidates: ids.length, sent, skips };
  }
);
