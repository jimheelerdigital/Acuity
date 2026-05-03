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
 *   - Does NOT call any provider revoke endpoint. Provider-level
 *     revocation is the user's responsibility (Apple Calendar →
 *     Settings → Calendar Accounts; Google → security settings).
 *     We only drop our local connection state.
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

  await prisma.user.update({
    where: { id: userId },
    data: {
      calendarConnectedProvider: null,
      calendarConnectedAt: null,
      targetCalendarId: null,
    },
  });

  safeLog.info("calendar.disconnect", {
    userId,
    priorProvider,
  });

  return NextResponse.json({ ok: true });
}
