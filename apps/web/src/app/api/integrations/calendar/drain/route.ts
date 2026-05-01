/**
 * GET /api/integrations/calendar/drain
 *
 * Mobile foreground hook calls this endpoint to fetch the work
 * queue: every Task with calendarSyncStatus = PENDING for the
 * current user, projected to the CalendarSyncOp shape mobile
 * needs to apply via EventKit.
 *
 * No state transition here — the planner already wrote PENDING
 * when the API route mutated the task. This endpoint is a pure
 * read, returning a stable snapshot. Mobile applies the ops
 * locally and reports each result via /sync-result, which calls
 * applySyncResult (PENDING → SYNCED / FAILED).
 *
 * Gated by canSyncCalendar entitlement. FREE post-trial users see
 * 402 SUBSCRIPTION_REQUIRED — defense in depth, since mobile UI
 * already locks the foreground hook out for non-PRO users.
 *
 * Returns 200 { ops: CalendarSyncOp[] } on success, possibly empty.
 * Includes a Cache-Control: no-store so a stale phone cache doesn't
 * apply yesterday's queue.
 */

import { NextRequest, NextResponse } from "next/server";

import {
  type CalendarProviderId,
  type CalendarSyncOp,
} from "@/lib/calendar-sync";
import { getAnySessionUserId } from "@/lib/mobile-auth";
import { requireEntitlement } from "@/lib/paywall";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DRAIN_BATCH_SIZE = 100;

function isProviderId(s: unknown): s is CalendarProviderId {
  return s === "ios_eventkit" || s === "google" || s === "outlook";
}

function sanitizeTitle(raw: string): string {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return "(untitled)";
  return collapsed.length > 200 ? collapsed.slice(0, 200) + "…" : collapsed;
}

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const gated = await requireEntitlement("canSyncCalendar", userId);
  if (!gated.ok) return gated.response;

  const { prisma } = await import("@/lib/prisma");

  // Single query: read the user's calendar prefs + a bounded slice
  // of their PENDING tasks. The composite index added in slice C3
  // (`@@index([userId, calendarSyncStatus])`) supports this.
  const [user, tasks] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        calendarConnectedProvider: true,
        targetCalendarId: true,
        defaultEventDuration: true,
      },
    }),
    prisma.task.findMany({
      where: { userId, calendarSyncStatus: "PENDING" },
      select: {
        id: true,
        title: true,
        text: true,
        status: true,
        dueDate: true,
        calendarEventId: true,
      },
      // Oldest-first so a backed-up queue drains FIFO; users see
      // their first-queued tasks reach calendar before fresh ones.
      orderBy: { createdAt: "asc" },
      take: DRAIN_BATCH_SIZE,
    }),
  ]);

  if (
    !user ||
    !isProviderId(user.calendarConnectedProvider) ||
    !user.targetCalendarId
  ) {
    // User isn't connected — nothing to drain. Still 200 OK + empty
    // so mobile can keep its hook idempotent.
    return NextResponse.json(
      { ops: [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const duration =
    user.defaultEventDuration === "ALL_DAY" ? "ALL_DAY" : "TIMED";

  const ops: CalendarSyncOp[] = tasks.map((t) => ({
    taskId: t.id,
    userId,
    // The kind is derived at drain time from the task's current
    // status. status=DONE → complete (rewrite event title with
    // strikethrough); otherwise upsert (create-or-update).
    kind: t.status === "DONE" ? "complete" : "upsert",
    providerEventId: t.calendarEventId,
    providerId: user.calendarConnectedProvider as CalendarProviderId,
    targetCalendarId: user.targetCalendarId as string,
    taskTitle: sanitizeTitle(t.title ?? t.text ?? "(untitled)"),
    dueDateISO: t.dueDate ? t.dueDate.toISOString() : null,
    duration,
  }));

  return NextResponse.json(
    { ops },
    { headers: { "Cache-Control": "no-store" } }
  );
}
