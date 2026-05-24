/**
 * Daily Google Calendar sync — slice 2 v1.2 Calendar Integration.
 *
 * Fires daily at 03:00 UTC. Walks every user with a connected
 * Google Calendar (googleCalendarRefreshToken non-null) and pulls
 * their last-30-days + next-7-days events into CalendarEvent.
 *
 * Why 03:00 UTC: stays out of the busy 00:00-02:00 window where
 * other crons fire (snapshot, content factory, trial expiration).
 * Calendar API is rate-limited per-project, so we serialize users
 * one-at-a-time inside the function rather than parallelizing.
 *
 * Per-user step.run: failures surface in Inngest's UI per user
 * instead of crashing the whole batch.
 */

import { inngest } from "@/inngest/client";
import { syncCalendarEventsForUser } from "@/lib/calendar/sync";
import { safeLog } from "@/lib/safe-log";

export const calendarSyncCronFn = inngest.createFunction(
  {
    id: "calendar-sync-cron",
    name: "Calendar sync — daily refresh of connected users",
    triggers: [{ cron: "0 3 * * *" }],
    retries: 2,
  },
  async ({ step, logger }) => {
    const { prisma } = await import("@/lib/prisma");

    const users = await prisma.user.findMany({
      where: { googleCalendarRefreshToken: { not: null } },
      select: { id: true },
    });

    if (users.length === 0) {
      safeLog.info("calendar-sync-cron.noop");
      return { syncedUsers: 0, totalEvents: 0 };
    }

    let totalEvents = 0;
    let successCount = 0;
    let failureCount = 0;

    for (const u of users) {
      const result = await step.run(`sync-${u.id}`, async () => {
        return syncCalendarEventsForUser(u.id);
      });
      if (result.ok) {
        successCount += 1;
        totalEvents += result.eventsUpserted;
      } else {
        failureCount += 1;
      }
    }

    logger.info(
      `calendar-sync-cron: ${successCount} synced (${totalEvents} events), ${failureCount} failed`
    );
    return {
      syncedUsers: successCount,
      failedUsers: failureCount,
      totalEvents,
      candidateUsers: users.length,
    };
  }
);
