/**
 * Nightly achievement sweep — fires the background trigger types that
 * don't naturally fall out of the per-entry pipeline.
 *
 * Schedule: daily 04:00 UTC. Picked to land in the quiet window
 * after the Sunday-morning weekly-report cron (Saturday 23:00 UTC)
 * and before US east-coast users wake up. Total cost per night is
 * dominated by the LIFE_AREA_LIFT history scan; with ~10 axes ×
 * snapshots-per-week-per-user, the per-user scan is sub-second.
 *
 * Scope reduction (2026-05-31 v1.3 ship): we only sweep users who
 * have been active in the last 30 days. Long-dormant users will get
 * their badges retroactively on next entry (the realtime evaluator
 * runs unconditionally), so we don't burn budget evaluating cohorts
 * who can't see the result.
 *
 * Failure mode: per-user errors logged + swallowed. A single user's
 * bad data shouldn't kill the whole sweep.
 */

import { inngest } from "@/inngest/client";
import { safeLog } from "@/lib/safe-log";

export const achievementsNightlyFn = inngest.createFunction(
  {
    id: "achievements-nightly",
    name: "Achievements — nightly sweep",
    triggers: [{ cron: "0 4 * * *" }],
    retries: 2,
  },
  async ({ step, logger }) => {
    const { prisma } = await import("@/lib/prisma");
    const { evaluateBackground } = await import("@/lib/achievements");

    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const candidates = await step.run("load-active-users", async () => {
      return prisma.user.findMany({
        where: {
          OR: [
            { lastRecordingAt: { gte: cutoff } },
            { lastSessionDate: { gte: cutoff } },
          ],
        },
        select: { id: true },
      });
    });

    logger.info("[achievements-nightly] scanning users", {
      count: candidates.length,
    });

    let totalAwarded = 0;
    for (const u of candidates) {
      try {
        const awarded = await evaluateBackground(prisma, u.id);
        totalAwarded += awarded.length;
        if (awarded.length > 0) {
          logger.info("[achievements-nightly] awarded", {
            userId: u.id,
            slugs: awarded.map((a) => a.slug),
          });
        }
      } catch (err) {
        safeLog.warn("achievements-nightly.user-failed", {
          userId: u.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { usersScanned: candidates.length, totalAwarded };
  }
);
