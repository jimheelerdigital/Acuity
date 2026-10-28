/**
 * Google Calendar direct sign-in — server-side queue drain (2026-10-28).
 *
 * For a person connected with provider "google", the server (not the
 * phone) writes their queued task events to Google Calendar. Triggered by
 * `calendar/google.drain-requested` { userId }, which lib/enqueue-sync.ts,
 * lib/calendar-deletion.ts and the OAuth callback send right after they
 * queue something. The 30-min calendar cron
 * (drain-pending-calendar-tasks.ts) sends it too, for anything still
 * PENDING (retryable failures, lost events).
 *
 * Debounced per user: a recording that creates ten tasks, or a burst of
 * edits, becomes one run ~10s after the last one, after the callers'
 * writes have committed. One run per user at a time.
 *
 * Gates, both failing closed: the calendar_google_direct feature flag and
 * the canSyncCalendar entitlement. When either is off nothing is sent to
 * Google; queued tasks stay PENDING and the stuck-task cron marks them
 * FAILED after 24h, same as a phone that never opens.
 */

import { inngest } from "@/inngest/client";
import { GOOGLE_DRAIN_EVENT } from "@/lib/calendar/server-drain-request";
import { safeLog } from "@/lib/safe-log";

export const googleCalendarDrainFn = inngest.createFunction(
  {
    id: "google-calendar-drain",
    name: "Calendar sync — Google Calendar direct drain",
    triggers: [{ event: GOOGLE_DRAIN_EVENT }],
    retries: 2,
    concurrency: { key: "event.data.userId", limit: 1 },
    debounce: { key: "event.data.userId", period: "10s" },
  },
  async ({ event, step }) => {
    const userId =
      event.data && typeof (event.data as { userId?: unknown }).userId === "string"
        ? (event.data as { userId: string }).userId
        : null;
    if (!userId) return { skipped: "no-userid" };

    const allowed = await step.run("gate", async () => {
      const { isEnabled } = await import("@/lib/feature-flags");
      const { GOOGLE_DIRECT_FLAG } = await import("@/lib/calendar/google-direct");
      if (!(await isEnabled(userId, GOOGLE_DIRECT_FLAG))) return "flag-off";
      const { resolveEntitlement } = await import("@/lib/entitlements/resolve");
      const resolved = await resolveEntitlement(userId);
      if (!resolved?.entitlement.canSyncCalendar) return "not-entitled";
      return "ok";
    });
    if (allowed !== "ok") {
      safeLog.info("calendar.google.drain.skipped", { userId, reason: allowed });
      return { skipped: allowed };
    }

    const summary = await step.run("drain", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { drainGoogleCalendarForUser } = await import(
        "@/lib/calendar/google-calendar-executor"
      );
      return drainGoogleCalendarForUser(prisma, userId);
    });
    safeLog.info("calendar.google.drain", { userId, ...summary });
    return summary;
  }
);
