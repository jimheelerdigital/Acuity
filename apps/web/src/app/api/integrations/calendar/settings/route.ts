/**
 * GET    /api/integrations/calendar/settings
 * PATCH  /api/integrations/calendar/settings
 *
 * GET — read the connected user's calendar preferences. Used by
 * mobile (slice C5c) when it mounts the integrations screen so the
 * settings reflect current state without round-tripping the whole
 * /api/user/me payload. Returns 200 with the connection summary,
 * including a `connected: boolean` discriminator so the client can
 * branch on shape without 404 special-casing.
 *
 * PATCH — mutate a connected user's calendar preferences without
 * re-running the full connect flow. Used by the settings UI for:
 *   - autoSendTasks toggle
 *   - defaultEventDuration radio
 *   - targetCalendarId picker (re-targeting to a different calendar)
 *
 * Body shape (all fields optional — pass only the fields being
 * changed):
 *   {
 *     "autoSendTasks"?: boolean,
 *     "defaultEventDuration"?: "ALL_DAY" | "TIMED",
 *     "targetCalendarId"?: string
 *   }
 *
 * Re-targeting calendars: per scoping doc §9, "delete event from old
 * calendar, create in new" is the user mental model. Slice C5a sets
 * the new targetCalendarId; the actual re-sync (mark all SYNCED
 * tasks PENDING again so mobile flushes them to the new calendar)
 * fires via a follow-up call mobile makes after the settings PATCH
 * succeeds. This keeps the route handler small + provider-agnostic.
 *
 * Gated by canSyncCalendar. PATCH requires a connected provider —
 * 409 if the user hasn't run /connect first (settings PATCH on a
 * disconnected user is meaningless).
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { requireEntitlement } from "@/lib/paywall";
import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_DURATIONS = ["ALL_DAY", "TIMED"] as const;

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const gated = await requireEntitlement("canSyncCalendar", userId);
  if (!gated.ok) return gated.response;

  const { prisma } = await import("@/lib/prisma");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      calendarConnectedProvider: true,
      calendarConnectedAt: true,
      targetCalendarId: true,
      autoSendTasks: true,
      defaultEventDuration: true,
    },
  });

  if (!user || !user.calendarConnectedProvider) {
    return NextResponse.json({
      connected: false,
      calendar: null,
    });
  }

  return NextResponse.json({
    connected: true,
    calendar: {
      provider: user.calendarConnectedProvider,
      connectedAt: user.calendarConnectedAt,
      targetCalendarId: user.targetCalendarId,
      autoSendTasks: user.autoSendTasks,
      defaultEventDuration: user.defaultEventDuration,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const gated = await requireEntitlement("canSyncCalendar", userId);
  if (!gated.ok) return gated.response;

  const body = (await req.json().catch(() => null)) as {
    autoSendTasks?: unknown;
    defaultEventDuration?: unknown;
    targetCalendarId?: unknown;
  } | null;

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (body.autoSendTasks !== undefined) {
    if (typeof body.autoSendTasks !== "boolean") {
      return NextResponse.json(
        { error: "autoSendTasks must be boolean" },
        { status: 400 }
      );
    }
    update.autoSendTasks = body.autoSendTasks;
  }

  if (body.defaultEventDuration !== undefined) {
    if (
      typeof body.defaultEventDuration !== "string" ||
      !VALID_DURATIONS.includes(
        body.defaultEventDuration as (typeof VALID_DURATIONS)[number]
      )
    ) {
      return NextResponse.json(
        { error: "Invalid defaultEventDuration" },
        { status: 400 }
      );
    }
    update.defaultEventDuration = body.defaultEventDuration;
  }

  if (body.targetCalendarId !== undefined) {
    if (
      typeof body.targetCalendarId !== "string" ||
      body.targetCalendarId.length === 0 ||
      body.targetCalendarId.length > 256
    ) {
      return NextResponse.json(
        { error: "Invalid targetCalendarId" },
        { status: 400 }
      );
    }
    update.targetCalendarId = body.targetCalendarId;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 }
    );
  }

  const { prisma } = await import("@/lib/prisma");

  // Ensure the user is actually connected before letting them
  // tweak settings. Avoids confused-state writes where a
  // disconnected user updates `autoSendTasks` and then re-connects
  // expecting that value to apply (it would, but the UX flow
  // shouldn't allow this entry point in the first place).
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { calendarConnectedProvider: true },
  });
  if (!existing?.calendarConnectedProvider) {
    return NextResponse.json(
      { error: "Calendar not connected" },
      { status: 409 }
    );
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: update,
    select: {
      calendarConnectedProvider: true,
      targetCalendarId: true,
      autoSendTasks: true,
      defaultEventDuration: true,
    },
  });

  safeLog.info("calendar.settings.patch", {
    userId,
    fieldsChanged: Object.keys(update),
  });

  return NextResponse.json({ ok: true, calendar: user });
}
