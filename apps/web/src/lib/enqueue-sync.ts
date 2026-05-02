import "server-only";

import type { Prisma, PrismaClient, Task, User } from "@prisma/client";

import {
  planSyncOp,
  type CalendarSyncOpKind,
  type TaskForPlanning,
  type UserForPlanning,
} from "@/lib/calendar-sync";

/**
 * Wire-up helper bridging the /api/tasks mutation routes to the
 * provider-agnostic calendar-sync engine (slice C5a).
 *
 * The helper:
 *   1. Reads Task + User in a single round-trip (narrow select).
 *   2. Calls `planSyncOp` (pure function, slice C4) to decide
 *      whether a calendar op is needed and what shape it takes.
 *   3. Writes Task.calendarSyncStatus = PENDING when an op IS
 *      needed. The actual provider write happens on mobile next
 *      foreground, per Option α.
 *
 * Uses the abstract `MobileQueueExecutor` semantics from C4: there
 * is no synchronous executor call here. Setting `calendarSyncStatus
 * = PENDING` IS the enqueue. The mobile drain endpoint reads from
 * the per-user PENDING set; the sync-result endpoint applies the
 * eventual outcome via `applySyncResult`.
 *
 * Phase A v1.1 limitation (intentional, scope-locked):
 *   - "delete" ops are NOT enqueued. When a Task is dismissed
 *     (`/api/tasks` PATCH action="dismiss"), the row is hard-
 *     deleted; the corresponding calendar event becomes an
 *     orphan (same pattern as disconnect). Document via UI copy
 *     in slice C5b. Proper delete-sync needs either a soft-delete
 *     column or a side-queue table — schema change deferred to
 *     post-launch.
 */

/** Action signaled by the calling /api/tasks branch. */
export type TaskMutationAction =
  | "create"   // POST — fresh upsert
  | "edit"     // PATCH edit (title, dueDate, priority, etc.)
  | "complete" // PATCH complete
  | "reopen"   // PATCH reopen — re-emit upsert to un-strike-through
  | "manual";  // explicit "Send to calendar" tap, bypasses autoSendTasks

const ACTION_TO_KIND: Record<TaskMutationAction, CalendarSyncOpKind> = {
  create: "upsert",
  edit: "upsert",
  reopen: "upsert",
  complete: "complete",
  manual: "upsert",
};

/**
 * Plan + enqueue (or no-op) the calendar sync for a Task mutation.
 *
 * Design notes:
 *   - All writes are idempotent: re-running this function with the
 *     same action against the same Task is safe — it will plan the
 *     same op shape and either set PENDING again (no-op visible) or
 *     short-circuit if no op is needed.
 *   - Failure is non-fatal at the route layer: callers wrap in try/
 *     catch and let the task mutation succeed even if enqueue
 *     errors. Stuck-task escalation cron picks up anything that
 *     went silently wrong.
 *   - Provider-agnostic. Does not import any provider SDK. Does not
 *     call any executor — sets PENDING and returns.
 */
/**
 * Detect Prisma's "column does not exist" error code (P2022).
 *
 * Used to gracefully short-circuit when the C3 calendar columns
 * (calendarConnectedProvider, autoSendTasks, defaultEventDuration,
 * targetCalendarId, calendarEventId, calendarSyncStatus) live in
 * the schema + generated client but haven't yet been pushed to
 * the production DB via `prisma db push`. The dashboard hotfix
 * (commit 54af6c0) added explicit selects to the user-flow
 * blockers; this helper closes the warn-spam gap on the
 * /api/tasks call sites that try/catch around enqueue-sync. Once
 * `db push` lands and the columns exist, this branch becomes a
 * no-op (P2022 stops firing).
 */
function isMissingColumnError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  if (code === "P2022") return true;
  // PostgreSQL native error code 42703 = "undefined column" — same
  // condition surfaced by raw queries that bypass Prisma's mapping.
  const meta = (err as { meta?: { code?: unknown } }).meta;
  if (meta && meta.code === "42703") return true;
  // String-match fallback for cases where Prisma wraps the error
  // before tagging the code (rare but seen on some pool-error paths).
  const message = (err as { message?: unknown }).message;
  return (
    typeof message === "string" &&
    /column .* does not exist/i.test(message)
  );
}

export async function enqueueSyncForTask(
  tx: PrismaClient | Prisma.TransactionClient,
  taskId: string,
  userId: string,
  action: TaskMutationAction
): Promise<{ enqueued: boolean; reason?: string }> {
  try {
    // Single round-trip read of the fields the planner needs from
    // both Task and User. Wider selects would risk leaking unrelated
    // fields into the planner's input contract.
    const task = await tx.task.findFirst({
      where: { id: taskId, userId },
      select: {
        id: true,
        userId: true,
        title: true,
        text: true,
        status: true,
        dueDate: true,
        calendarEventId: true,
        calendarSyncStatus: true,
      },
    });
    if (!task) return { enqueued: false, reason: "task-not-found" };

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        calendarConnectedProvider: true,
        targetCalendarId: true,
        autoSendTasks: true,
        defaultEventDuration: true,
      },
    });
    if (!user) return { enqueued: false, reason: "user-not-found" };

    const kind = ACTION_TO_KIND[action];
    const op = planSyncOp(
      task as TaskForPlanning,
      user as UserForPlanning,
      {
        kind,
        manuallyRequested: action === "manual",
      }
    );

    if (!op) return { enqueued: false, reason: "no-op-needed" };

    // Set PENDING. Mobile drains the queue next foreground.
    await tx.task.update({
      where: { id: taskId },
      data: { calendarSyncStatus: "PENDING" },
    });

    return { enqueued: true };
  } catch (err) {
    // P2022 short-circuit — production DB hasn't yet had `prisma
    // db push` run for the C3 calendar columns. Fail clean instead
    // of throwing into the /api/tasks try/catch which logs a
    // safeLog.warn for every task mutation. Drops the warn-spam to
    // zero until the migration lands.
    if (isMissingColumnError(err)) {
      return { enqueued: false, reason: "schema-not-ready" };
    }
    // Any other error: re-throw so the existing /api/tasks try/
    // catch surfaces it. Real bugs should still light up Sentry.
    throw err;
  }
}

/**
 * Lighter-weight signature for callers that already have the Task
 * + User loaded (e.g. inside an existing transaction). Skips the
 * round-trip read; takes the narrowed inputs directly.
 */
export async function enqueueSyncForLoadedTask(
  tx: PrismaClient | Prisma.TransactionClient,
  task: TaskForPlanning,
  user: UserForPlanning,
  action: TaskMutationAction
): Promise<{ enqueued: boolean; reason?: string }> {
  const kind = ACTION_TO_KIND[action];
  const op = planSyncOp(task, user, {
    kind,
    manuallyRequested: action === "manual",
  });
  if (!op) return { enqueued: false, reason: "no-op-needed" };

  await tx.task.update({
    where: { id: task.id },
    data: { calendarSyncStatus: "PENDING" },
  });
  return { enqueued: true };
}
