/**
 * POST /api/integrations/calendar/sync-result
 *
 * Mobile reports the outcome of an EventKit op the foreground hook
 * applied locally. Server records the state transition via
 * applySyncResult (slice C4).
 *
 * Body shape (discriminated on `ok`):
 *   { taskId, ok: true, providerEventId: string }
 *   { taskId, ok: false, retryable: true,  reason: string }
 *   { taskId, ok: false, retryable: false, reason: string }
 *
 * Returns 200 { ok: true } on success. 401 unauth, 403 if the task
 * isn't owned by the caller (don't leak existence with 404), 400
 * invalid body. Gated by canSyncCalendar entitlement so a user who
 * downgraded to FREE post-trial can't keep posting results — their
 * mobile client should already be locked out, but defense in depth.
 */

import { NextRequest, NextResponse } from "next/server";

import { applySyncResult, type CalendarSyncOpResult } from "@/lib/calendar-sync";
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

  const body = (await req.json().catch(() => null)) as {
    taskId?: unknown;
    ok?: unknown;
    providerEventId?: unknown;
    retryable?: unknown;
    reason?: unknown;
  } | null;

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (typeof body.taskId !== "string" || body.taskId.length === 0) {
    return NextResponse.json({ error: "Missing taskId" }, { status: 400 });
  }
  if (typeof body.ok !== "boolean") {
    return NextResponse.json({ error: "Missing ok" }, { status: 400 });
  }

  let result: CalendarSyncOpResult;
  if (body.ok === true) {
    if (typeof body.providerEventId !== "string") {
      return NextResponse.json(
        { error: "Missing providerEventId on ok=true" },
        { status: 400 }
      );
    }
    result = {
      taskId: body.taskId,
      ok: true,
      providerEventId: body.providerEventId,
    };
  } else {
    if (typeof body.retryable !== "boolean") {
      return NextResponse.json(
        { error: "Missing retryable on ok=false" },
        { status: 400 }
      );
    }
    const reason =
      typeof body.reason === "string"
        ? body.reason.slice(0, 500) // bound the field
        : "unknown";
    result = body.retryable
      ? { taskId: body.taskId, ok: false, retryable: true, reason }
      : { taskId: body.taskId, ok: false, retryable: false, reason };
  }

  const { prisma } = await import("@/lib/prisma");

  // Ownership check — don't trust the client. Fetch the Task row
  // narrowly and confirm userId matches before applying.
  const owned = await prisma.task.findFirst({
    where: { id: body.taskId, userId },
    select: { id: true },
  });
  if (!owned) {
    safeLog.warn("calendar.sync-result.foreign-task", { userId, taskId: body.taskId });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await applySyncResult(prisma, result);

  safeLog.info("calendar.sync-result", {
    userId,
    taskId: body.taskId,
    ok: body.ok,
    retryable: body.ok === false ? body.retryable : null,
  });

  return NextResponse.json({ ok: true });
}
