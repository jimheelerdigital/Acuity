/**
 * POST /api/integrations/calendar/disconnect
 *
 * Slice C5c — gives a connected user a one-tap off-ramp. Clears the
 * provider + target + connectedAt fields so subsequent /account
 * page loads render the "Connect from iOS app" placeholder again.
 *
 * What it does NOT do (deferred to follow-up):
 *   - Does NOT delete events the integration already created on the
 *     user's calendar. Per scoping doc §9 the user mental model is
 *     "leave existing events alone; stop creating new ones." Mobile
 *     can offer a separate "delete created events" affordance later.
 *   - Does NOT touch Task.calendarSyncedAt / calendarEventId fields
 *     on existing tasks. Future re-connects can decide whether to
 *     re-sync or treat them as stale.
 *   - Phone providers: does NOT call any provider revoke endpoint
 *     (Apple Calendar → Settings → Calendar Accounts). We only drop our
 *     local connection state. Google Calendar direct (2026-10-28) is
 *     the exception: we hold its OAuth grant, so we revoke it at
 *     Google and delete the stored tokens.
 *
 * autoSendTasks + defaultEventDuration are PRESERVED. If the user
 * re-connects later, those preferences hold. Same pattern as the
 * checkout/portal sub flow: cancellation doesn't wipe history.
 *
 * Gates:
 *   1. Auth — getAnySessionUserId (works for web session + mobile bearer)
 *   2. Tier — requireEntitlement("canSyncCalendar")
 *   3. Pre-condition — user must currently have a connection (409 otherwise)
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { requireEntitlement } from "@/lib/paywall";
import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gated = await requireEntitlement("canSyncCalendar", userId);
  if (!gated.ok) return gated.response;

  const { prisma } = await import("@/lib/prisma");

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      calendarConnectedProvider: true,
    },
  });
  if (!existing?.calendarConnectedProvider) {
    return NextResponse.json(
      { error: "Calendar not connected" },
      { status: 409 }
    );
  }

  const priorProvider = existing.calendarConnectedProvider;

  // Clears the provider, un-queues PENDING tasks (nothing will drain them
  // any more; they'd escalate to FAILED a day later, 2026-10-23) and drops
  // queued event deletions for dismissed tasks.
  const { releaseCalendarQueue } = await import("@/lib/calendar/google-direct");
  await releaseCalendarQueue(prisma, userId);

  // Google Calendar direct (2026-10-28): revoke our grant at Google
  // (best-effort) and delete the stored tokens. Existing events stay.
  if (priorProvider === "google") {
    const { dropGoogleConnection } = await import("@/lib/calendar/google-direct");
    if (!(await dropGoogleConnection(prisma, userId))) {
      safeLog.warn("calendar.disconnect.google_revoke_failed", { userId });
    }
  }

  safeLog.info("calendar.disconnect", {
    userId,
    priorProvider,
  });

  return NextResponse.json({ ok: true });
}
