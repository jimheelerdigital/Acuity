/**
 * GET /api/entries/[id]/calendar-events
 *
 * Returns the user's CalendarEvent rows around an entry's createdAt
 * ([createdAt - 12h, createdAt + 6h]) so the mobile entry-detail
 * screen can render the events-that-day section + link controls.
 *
 * Web reads this same window via direct Prisma server-side; mobile
 * needs the API because it can't reach the DB directly.
 *
 * Auth: standard mobile-or-cookie session. The endpoint verifies the
 * entry belongs to the caller before returning anything so an attacker
 * can't probe other users' entry ids for calendar metadata.
 *
 * Shape stays small so the response is one round-trip even on slow
 * mobile networks. Attendees are normalized to display strings
 * server-side — clients don't need to know the underlying JSONB
 * shape.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LOOKBACK_HOURS = 12;
const LOOKAHEAD_HOURS = 6;
const MAX_EVENTS = 25;

interface AttendeeRow {
  email?: string | null;
  displayName?: string | null;
}

function normalizeAttendees(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is AttendeeRow => typeof r === "object" && r !== null)
    .map((r) => r.displayName?.trim() || r.email?.trim() || "")
    .filter((s) => s.length > 0);
}

export async function GET(
  req: NextRequest,
  ctx: { params: { id: string } }
) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");

  const entry = await prisma.entry.findFirst({
    where: { id: ctx.params.id, userId },
    select: { createdAt: true, linkedEventIds: true },
  });
  if (!entry) {
    return NextResponse.json({ error: "NotFound" }, { status: 404 });
  }

  const windowStart = new Date(
    entry.createdAt.getTime() - LOOKBACK_HOURS * 3600_000
  );
  const windowEnd = new Date(
    entry.createdAt.getTime() + LOOKAHEAD_HOURS * 3600_000
  );

  const rows = await prisma.calendarEvent.findMany({
    where: { userId, startTime: { gte: windowStart, lt: windowEnd } },
    orderBy: { startTime: "asc" },
    take: MAX_EVENTS,
    select: {
      id: true,
      summary: true,
      startTime: true,
      endTime: true,
      attendees: true,
      location: true,
    },
  });

  const linked = new Set(entry.linkedEventIds ?? []);
  const events = rows.map((e) => ({
    id: e.id,
    summary: e.summary,
    startTime: e.startTime.toISOString(),
    endTime: e.endTime?.toISOString() ?? null,
    location: e.location,
    attendees: normalizeAttendees(e.attendees),
    linked: linked.has(e.id),
  }));

  return NextResponse.json({ events });
}
