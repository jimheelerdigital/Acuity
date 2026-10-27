import type { PrismaClient } from "@prisma/client";

import type { CalendarProviderId, CalendarSyncOp } from "@/lib/calendar-sync";
import { PHONE_PROVIDERS } from "@/lib/device-calendar-events";

/**
 * Dismissed task → remove its event from the phone calendar (2026-10-27).
 *
 * Dismissing a task hard-deletes the Task row (unchanged, so no task list,
 * count, widget, Siri, watch or insights query ever sees a "dismissed"
 * task). Before the delete, the event id goes into a small queue
 * (CalendarDeletion). The phone picks it up from GET /drain as a `delete`
 * op and confirms via POST /sync-result, which removes the queue row.
 *
 * Old app JS can't execute deletes: its drain loop would treat an unknown
 * op as an upsert and recreate the event. So /drain only returns delete
 * ops to phones that ask for them (`?supports=delete`). Rows nobody
 * drains expire after DELETION_TTL_MS (calendar cron), and disconnect
 * drops them.
 */

export const DELETION_OP_PREFIX = "calendar-deletion:";
export const DELETION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const DELETION_MAX_ATTEMPTS = 5;
export const DELETION_DRAIN_BATCH = 100;

export function deletionOpId(id: string): string {
  return `${DELETION_OP_PREFIX}${id}`;
}

/** The CalendarDeletion id inside a drain/sync-result taskId, or null. */
export function parseDeletionOpId(taskId: string): string | null {
  if (!taskId.startsWith(DELETION_OP_PREFIX)) return null;
  const id = taskId.slice(DELETION_OP_PREFIX.length);
  return id.length > 0 ? id : null;
}

/** `?supports=delete` (comma-separated capabilities). */
export function drainSupportsDelete(searchParams: URLSearchParams): boolean {
  return (searchParams.get("supports") ?? "")
    .split(",")
    .map((s) => s.trim())
    .includes("delete");
}

type Db = Pick<PrismaClient, "user" | "calendarDeletion">;

/**
 * Called by the dismiss route BEFORE it deletes the task. Queues the
 * event's deletion when the task has a calendar event and the user has a
 * phone calendar connected (the only provider whose writes run today).
 * Never throws: the dismiss must succeed regardless.
 */
export async function queueCalendarDeletion(
  db: Db,
  userId: string,
  calendarEventId: string | null | undefined
): Promise<boolean> {
  if (!calendarEventId) return false;
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { calendarConnectedProvider: true },
    });
    if (!user?.calendarConnectedProvider || !PHONE_PROVIDERS.has(user.calendarConnectedProvider)) {
      return false;
    }
    await db.calendarDeletion.upsert({
      where: { userId_providerEventId: { userId, providerEventId: calendarEventId } },
      create: { userId, providerEventId: calendarEventId },
      update: {},
    });
    return true;
  } catch (err) {
    console.warn(
      "[calendar-deletion] not queued (non-fatal):",
      err instanceof Error ? err.message : err
    );
    return false;
  }
}

/** Drain ops for queued deletions (kind "delete"). */
export function deletionOps(
  rows: Array<{ id: string; providerEventId: string }>,
  user: { userId: string; providerId: CalendarProviderId; targetCalendarId: string }
): CalendarSyncOp[] {
  return rows.map((r) => ({
    taskId: deletionOpId(r.id),
    userId: user.userId,
    kind: "delete",
    providerEventId: r.providerEventId,
    providerId: user.providerId,
    targetCalendarId: user.targetCalendarId,
    taskTitle: "",
    dueDateISO: null,
    duration: "TIMED",
  }));
}

export type DeletionResult =
  | { ok: true }
  | { ok: false; retryable: boolean; reason: string };

/**
 * Apply the phone's result for a deletion op. Success, or a failure that
 * won't fix itself, removes the row; a retryable failure counts an attempt
 * and gives up after DELETION_MAX_ATTEMPTS. Returns false when the row
 * isn't this user's (or is already gone).
 */
export async function applyDeletionResult(
  db: Pick<PrismaClient, "calendarDeletion">,
  userId: string,
  deletionId: string,
  result: DeletionResult
): Promise<boolean> {
  const row = await db.calendarDeletion.findFirst({
    where: { id: deletionId, userId },
    select: { id: true, attempts: true },
  });
  if (!row) return false;
  const giveUp =
    result.ok || !result.retryable || row.attempts + 1 >= DELETION_MAX_ATTEMPTS;
  if (giveUp) {
    await db.calendarDeletion.deleteMany({ where: { id: row.id } });
  } else {
    await db.calendarDeletion.update({
      where: { id: row.id },
      data: {
        attempts: { increment: 1 },
        lastError: result.ok ? null : result.reason.slice(0, 300),
      },
    });
  }
  return true;
}
