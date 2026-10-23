/**
 * POST /api/integrations/calendar/events
 *
 * The phone's calendar → Ripple (2026-10-23, "option a"). A connected
 * phone (Apple Calendar / Android calendar) sends the titles + times of
 * events in a window (yesterday to a week ahead). They land in
 * CalendarEvent, the same table the Google sync fills, so the extraction
 * prompt (lib/calendar/context.ts), entry → event links and the calendar
 * insights page work unchanged.
 *
 * A snapshot, not a stream: rows from this phone inside the window that
 * the phone no longer reports were deleted or cancelled, so they're
 * removed. Phone rows are keyed "device:<eventId@start>" so they never
 * collide with Google ids.
 *
 * Body: { windowStart, windowEnd, events: [{ id, title, start, end, allDay }] }
 *
 * Gates: auth → canSyncCalendar → connected with a phone provider.
 */
import { NextRequest, NextResponse } from "next/server";

import {
  DEVICE_EVENT_PREFIX,
  parseDeviceEvents,
  parseWindow,
  PHONE_PROVIDERS,
} from "@/lib/device-calendar-events";
import { getAnySessionUserId } from "@/lib/mobile-auth";
import { requireEntitlement } from "@/lib/paywall";
import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const gated = await requireEntitlement("canSyncCalendar", userId);
  if (!gated.ok) return gated.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const window = parseWindow(body?.windowStart, body?.windowEnd);
  const events = parseDeviceEvents(body?.events);
  if (!window || !events) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { calendarConnectedProvider: true },
  });
  if (!user?.calendarConnectedProvider || !PHONE_PROVIDERS.has(user.calendarConnectedProvider)) {
    return NextResponse.json({ error: "Calendar not connected" }, { status: 409 });
  }

  const ids = events.map((e) => DEVICE_EVENT_PREFIX + e.id);
  await prisma.$transaction(async (tx) => {
    await tx.calendarEvent.deleteMany({
      where: {
        userId,
        externalEventId: { startsWith: DEVICE_EVENT_PREFIX, notIn: ids },
        startTime: { gte: window.start, lt: window.end },
      },
    });
    for (const e of events) {
      const externalEventId = DEVICE_EVENT_PREFIX + e.id;
      const data = { summary: e.title || null, startTime: e.start, endTime: e.end, allDay: e.allDay };
      await tx.calendarEvent.upsert({
        where: { userId_externalEventId: { userId, externalEventId } },
        create: { userId, externalEventId, ...data },
        update: data,
        select: { id: true },
      });
    }
  }, { timeout: 20_000, maxWait: 10_000 });

  safeLog.info("calendar.device_events", { userId, count: events.length });
  return NextResponse.json({ ok: true, count: events.length });
}
