import { inngest } from "@/inngest/client";
import { safeLog } from "@/lib/safe-log";
import {
  DAY2_DEFAULT_LOCAL_TIME,
  isDay2Cohort,
  isWithinLocalHour,
  sendDay2Push,
} from "@/lib/v10-day2-push";

/**
 * v10 Day-2 nudge cron (spec §9 Screen 9).
 *
 * Hourly, because the send time is per-user local: someone who picked
 * "Morning" and someone who picked "Late" are eleven hours apart, and a
 * daily cron could only serve one of them.
 *
 * ── Flag-gated, default OFF ──────────────────────────────────────────
 * ENABLE_V10_DAY2_PUSH must be "1". Parsed fail-closed: anything else,
 * including unset, means this function iterates nothing and sends nothing.
 * A push cron is the least forgiving thing to enable by accident — there is
 * no unsend.
 */

const FLAG_ON = () => process.env.ENABLE_V10_DAY2_PUSH === "1";

export const v10Day2PushCronFn = inngest.createFunction(
  {
    id: "v10-day2-push-cron",
    name: "v10 Day-2 nudge",
    triggers: [{ cron: "0 * * * *" }],
    retries: 2,
  },
  async ({ step, logger }) => {
    if (!FLAG_ON()) {
      logger.info("v10-day2-push: flag off, noop");
      return { skipped: true, sent: 0 };
    }

    const { prisma } = await import("@/lib/prisma");
    const now = new Date();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    // Narrow in SQL to the 2-3 day age band and never-sent, so the
    // per-user timezone work below runs over a small set rather than the
    // whole table.
    const candidates = await step.run("load-cohort", async () =>
      prisma.user.findMany({
        where: {
          v10Day2PushSentAt: null,
          createdAt: {
            gte: new Date(now.getTime() - 3 * ONE_DAY),
            lt: new Date(now.getTime() - 2 * ONE_DAY),
          },
          pushToken: { not: null },
        },
        select: {
          id: true,
          createdAt: true,
          timezone: true,
          notificationTime: true,
        },
        // Bound the batch. An hour's cohort should be far smaller than
        // this; the cap stops one bad hour from becoming a runaway job.
        take: 500,
      })
    );

    let sent = 0;
    let skippedHour = 0;

    for (const u of candidates) {
      // Re-check in JS: the SQL band is inclusive at the edges and the
      // helper is what the tests pin.
      // step.run() serializes its result to JSON, so Dates come back as
      // ISO strings even though Prisma returned Date objects. Re-hydrating
      // here rather than widening the helper's type keeps the arithmetic
      // honest about what it operates on.
      const createdAt = new Date(u.createdAt);
      if (!isDay2Cohort(createdAt, now)) continue;

      // Their Screen 8 slot, mirrored onto notificationTime by the
      // reminders API. Falls back to the spec's default.
      const localTime = u.notificationTime || DAY2_DEFAULT_LOCAL_TIME;
      if (!isWithinLocalHour(now, u.timezone, localTime)) {
        skippedHour += 1;
        continue;
      }

      const ok = await sendDay2Push(u.id);
      if (ok) sent += 1;
    }

    safeLog.info("v10-day2-push.run", {
      candidates: candidates.length,
      sent,
      skippedHour,
    });

    return { sent, candidates: candidates.length };
  }
);
