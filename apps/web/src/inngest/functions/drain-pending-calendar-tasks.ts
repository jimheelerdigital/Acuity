/**
 * Calendar sync — pending-task drainer + stuck-task escalator.
 *
 * Two responsibilities, one Inngest function:
 *
 *   1. Cron path (every 30 min): scan all users with a connected
 *      calendar, find Tasks stuck in calendarSyncStatus = PENDING
 *      for > 24h, escalate them to FAILED. Prevents tasks from
 *      sitting silently un-flushed because the user hasn't opened
 *      mobile recently.
 *
 *   2. Event path: respond to `calendar/sync.foreground-requested`
 *      events emitted by the mobile foreground hook (slice C5/C6).
 *      Currently a no-op — actual drain logic ships when the
 *      mobile drain endpoint lands. The event handler is in place
 *      now so the mobile work doesn't have to register a new fn
 *      after C4 deploys.
 *
 * Provider-agnostic. This function does not call EventKit, Google
 * Calendar API, or any other external provider — Option α from the
 * scoping doc puts the actual provider write on mobile. The server
 * orchestrates state transitions and stuck-task escalation only.
 *
 * Retries: 3 (background). onFailure: logs only. Per-task escalation
 * is non-fatal — a single user's stuck task should not block the
 * batch for other users.
 */

import { inngest } from "@/inngest/client";
import { selectStuckTaskIds } from "@/lib/calendar-sync";
import { safeLog } from "@/lib/safe-log";

const ESCALATION_BATCH_SIZE = 200;

export const drainPendingCalendarTasksFn = inngest.createFunction(
  {
    id: "drain-pending-calendar-tasks",
    name: "Calendar sync — drain pending + escalate stuck",
    retries: 3,
    triggers: [
      { cron: "*/30 * * * *" },
      { event: "calendar/sync.foreground-requested" },
    ],
  },
  async ({ event, step }) => {
    const { prisma } = await import("@/lib/prisma");

    // ── Event path ──────────────────────────────────────────────
    if (event?.name === "calendar/sync.foreground-requested") {
      const userId =
        typeof event.data === "object" &&
        event.data &&
        "userId" in event.data &&
        typeof (event.data as { userId?: unknown }).userId === "string"
          ? (event.data as { userId: string }).userId
          : null;
      if (!userId) {
        safeLog.warn("calendar.foreground-requested.no-userid", {});
        return { skipped: true, reason: "no-userid" };
      }
      // Slice C4 placeholder. Real drain logic — handing PENDING
      // tasks back to mobile via the response, marking them
      // PROCESSING in the meantime — ships in slice C5/C6 when
      // the mobile drain endpoint lands. For now we just count
      // and log so the wiring is observable end-to-end.
      const pendingCount = await step.run("count-pending", async () => {
        return prisma.task.count({
          where: { userId, calendarSyncStatus: "PENDING" },
        });
      });
      safeLog.info("calendar.foreground-requested", {
        userId,
        pendingCount,
      });
      return { handled: true, pendingCount };
    }

    // ── Cron path ───────────────────────────────────────────────
    const now = new Date();

    const escalated = await step.run("escalate-stuck", async () => {
      const candidates = await prisma.task.findMany({
        where: {
          calendarSyncStatus: "PENDING",
          // Coarse pre-filter: only consider tasks created at least
          // 24h ago. The pure selector applies the precise threshold,
          // including the calendarSyncedAt fallback for partial-success
          // re-entries.
          createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
        select: {
          id: true,
          calendarSyncedAt: true,
          createdAt: true,
        },
        take: ESCALATION_BATCH_SIZE,
      });

      const stuckIds = selectStuckTaskIds(candidates, now);
      if (stuckIds.length === 0) return { escalated: 0, scanned: candidates.length };

      const result = await prisma.task.updateMany({
        where: { id: { in: stuckIds } },
        data: { calendarSyncStatus: "FAILED" },
      });

      safeLog.info("calendar.escalate-stuck", {
        escalated: result.count,
        scanned: candidates.length,
      });

      return { escalated: result.count, scanned: candidates.length };
    });

    return {
      tick: now.toISOString(),
      ...escalated,
    };
  }
);
