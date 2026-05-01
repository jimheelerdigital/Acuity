import "server-only";

import type { Prisma, PrismaClient, Task } from "@prisma/client";

/**
 * Calendar-sync engine — provider-agnostic interface (v1.1 slice C4).
 *
 * Architecture (Option α, locked in scoping doc Decisions §1):
 *   - Server is the orchestrator + state machine. It does NOT call
 *     EventKit or Google Calendar APIs directly.
 *   - Mobile is the executor. It applies real provider writes via
 *     EventKit (proxies Google + Outlook + iCloud through iOS).
 *   - Web-created task mutations enqueue PENDING ops on the server;
 *     the mobile foreground hook drains the queue, applies the work
 *     locally, and reports results back to the server.
 *
 * This file owns:
 *   1. The pure-function planner (`planSyncOp`) — given a Task and
 *      its owning User, decide whether a calendar op is needed and
 *      what shape it takes.
 *   2. The state-transition applier (`applySyncResult`) — idempotent
 *      Task row update from a result reported by the executor.
 *   3. The abstract `CalendarSyncExecutor` interface plus two
 *      concrete impls:
 *        - `NoopExecutor` — pretends every op succeeded, used in
 *          tests and during slice C4-only soak.
 *        - `MobileQueueExecutor` — marks Task PENDING and returns
 *          success-without-eventId. The actual provider write
 *          happens on mobile when the foreground hook drains the
 *          queue. C5/C6 wires the real drain endpoint.
 *
 * Provider-specific adapters (real EventKit calls, real Google
 * Calendar API calls) live elsewhere — they ship in slices C5/C6.
 * This file stays free of any provider import or provider-shape
 * detail beyond the discriminated `CalendarProviderId` enum.
 */

// ─── Types ──────────────────────────────────────────────────────────

/**
 * Provider discriminator. Stable strings — referenced by
 * User.calendarConnectedProvider and Task.calendarProviderId
 * (latter omitted from slice C3, derived from User at apply time).
 */
export type CalendarProviderId = "ios_eventkit" | "google" | "outlook";

/**
 * What kind of calendar mutation does this op produce?
 *   - upsert: create-or-update. Used for new tasks with dueDate, and
 *     for any subsequent edit (title/dueDate/time change) on a task
 *     that already has a calendarEventId.
 *   - complete: rewrite the event title with strikethrough markers
 *     (per scoping doc §6: "~Acuity: Buy birthday gift~"). Fired
 *     when Task.status transitions to DONE.
 *   - delete: remove the event from the user's calendar. Fired when
 *     a task is deleted in Acuity.
 */
export type CalendarSyncOpKind = "upsert" | "complete" | "delete";

/**
 * Per-task sync status. Mirrors Task.calendarSyncStatus.
 *   - NOT_SYNCED: no event exists, none expected (default).
 *   - PENDING: enqueued, not yet executed by mobile.
 *   - SYNCED: event exists in calendar, calendarEventId is the pointer.
 *   - FAILED: last attempt failed non-retryably or escalated by the
 *     stuck-task cron after >24h in PENDING.
 */
export type CalendarSyncStatus = "NOT_SYNCED" | "PENDING" | "SYNCED" | "FAILED";

/**
 * The work unit. Provider-agnostic — the executor decides which
 * concrete API to call. Mobile receives this shape via the drain
 * endpoint and translates to EventKit; future Google adapter does
 * the same in reverse.
 */
export interface CalendarSyncOp {
  taskId: string;
  userId: string;
  kind: CalendarSyncOpKind;
  /**
   * Pointer to the existing calendar event. Required for `complete`
   * and `delete`; optional for `upsert` (null = create new).
   */
  providerEventId: string | null;
  /** The user's connected provider — drives executor routing. */
  providerId: CalendarProviderId;
  /** Calendar id within the provider (e.g. EventKit calendar id). */
  targetCalendarId: string;
  /** Sanitized task title — same hygiene rules as calendar-prompt. */
  taskTitle: string;
  /** Due date if set, ISO 8601. Null = no time, all-day fallback. */
  dueDateISO: string | null;
  /** "ALL_DAY" | "TIMED" — User.defaultEventDuration at op time. */
  duration: "ALL_DAY" | "TIMED";
}

/**
 * What the executor reports back after attempting the op. Two
 * failure flavors: retryable means the queue should keep the task
 * in PENDING for another drain cycle; non-retryable means the task
 * flips to FAILED and surfaces the per-task retry button in the UI.
 */
export type CalendarSyncOpResult =
  | { taskId: string; ok: true; providerEventId: string }
  | { taskId: string; ok: false; retryable: true; reason: string }
  | { taskId: string; ok: false; retryable: false; reason: string };

// ─── Pure-function planner ──────────────────────────────────────────

/**
 * Read-only fields the planner needs from a Task. Subset of the
 * Prisma Task type — accepting the narrowed shape keeps callers
 * from having to fetch the entire row when only a few fields are
 * relevant.
 */
export type TaskForPlanning = Pick<
  Task,
  | "id"
  | "userId"
  | "title"
  | "text"
  | "status"
  | "dueDate"
  | "calendarEventId"
  | "calendarSyncStatus"
>;

/**
 * Read-only fields the planner needs from User. Same narrowing
 * principle.
 */
export interface UserForPlanning {
  calendarConnectedProvider: string | null;
  targetCalendarId: string | null;
  autoSendTasks: boolean;
  defaultEventDuration: string;
}

/**
 * Optional caller-provided trigger. When the user explicitly taps
 * "Send to calendar" on a task (autoSendTasks=false case), the API
 * route passes `manuallyRequested: true` so the planner bypasses
 * the auto-send check.
 *
 * `kind` is needed when the trigger is a status transition the
 * planner can't infer from the Task fields alone — specifically
 * "delete", which must be planned BEFORE the row disappears.
 */
export interface PlanContext {
  manuallyRequested?: boolean;
  /**
   * Override the inferred kind. Default behavior:
   *   - status=DONE  → "complete"
   *   - status=other → "upsert"
   * Pass kind="delete" from the DELETE /api/tasks/:id route since
   * the task row may already be gone by the time apply runs.
   */
  kind?: CalendarSyncOpKind;
}

/**
 * Decide whether a calendar sync is needed for this Task right now,
 * and shape the resulting op.
 *
 * Returns null when:
 *   - The user hasn't connected a calendar (no provider).
 *   - The user has no targetCalendarId selected.
 *   - The task has no dueDate AND we're not deleting (no time
 *     anchor for an upsert; nothing to delete if we never created).
 *   - autoSendTasks=false AND ctx.manuallyRequested !== true AND
 *     this is a fresh upsert (not a follow-up edit / completion of
 *     an already-synced task).
 */
export function planSyncOp(
  task: TaskForPlanning,
  user: UserForPlanning,
  ctx: PlanContext = {}
): CalendarSyncOp | null {
  // Provider must be set + recognized.
  const provider = task // eslint-disable-line @typescript-eslint/no-unused-vars
    ? user.calendarConnectedProvider
    : null;
  if (
    provider !== "ios_eventkit" &&
    provider !== "google" &&
    provider !== "outlook"
  ) {
    return null;
  }
  if (!user.targetCalendarId) return null;

  // Decide op kind.
  const inferredKind: CalendarSyncOpKind =
    ctx.kind ?? (task.status === "DONE" ? "complete" : "upsert");

  // Delete + complete only make sense if we had previously synced.
  // If the task has no calendarEventId, there's nothing in the
  // user's calendar to update or remove.
  if (
    (inferredKind === "complete" || inferredKind === "delete") &&
    !task.calendarEventId
  ) {
    return null;
  }

  // For upserts: the task must have a dueDate (the event needs a
  // time anchor) UNLESS we're updating a task that's already synced
  // (an existing event with a now-removed dueDate gets the delete
  // path, planned by the API route on dueDate clear).
  if (inferredKind === "upsert" && !task.dueDate && !task.calendarEventId) {
    return null;
  }

  // Auto-send gate: when off, only manually-requested ops or
  // follow-up ops on already-synced tasks proceed.
  const isFollowUp =
    task.calendarEventId !== null && task.calendarEventId !== "";
  if (
    !user.autoSendTasks &&
    !ctx.manuallyRequested &&
    !isFollowUp
  ) {
    return null;
  }

  const taskTitle = sanitizeTaskTitle(task.title ?? task.text ?? "(untitled)");
  const dueDateISO = task.dueDate ? task.dueDate.toISOString() : null;
  const duration =
    user.defaultEventDuration === "ALL_DAY" ? "ALL_DAY" : "TIMED";

  return {
    taskId: task.id,
    userId: task.userId,
    kind: inferredKind,
    providerEventId: task.calendarEventId ?? null,
    providerId: provider,
    targetCalendarId: user.targetCalendarId,
    taskTitle,
    dueDateISO,
    duration,
  };
}

/**
 * Strip newlines and cap title length. Defense against:
 *   - Calendar app rendering newlines as separate lines / titles.
 *   - Pathological multi-megabyte task titles paged through a
 *     mobile sync.
 * Same hygiene as `sanitizeTitle` in calendar-prompt.ts.
 */
function sanitizeTaskTitle(raw: string): string {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return "(untitled)";
  return collapsed.length > 200 ? collapsed.slice(0, 200) + "…" : collapsed;
}

// ─── Apply phase ────────────────────────────────────────────────────

/**
 * Idempotent Task-row update from an executor result.
 *
 * Idempotency: re-applying the same result twice is a no-op. The
 * shape we write is fully determined by `result`, so a duplicate
 * apply rewrites the same fields with the same values.
 *
 * Caller passes either a Prisma client or a transaction, same
 * pattern as themes.ts:upsertTheme — lets the API route batch this
 * inside the route's own transaction when desired.
 */
export async function applySyncResult(
  tx: PrismaClient | Prisma.TransactionClient,
  result: CalendarSyncOpResult
): Promise<void> {
  if (result.ok) {
    await tx.task.update({
      where: { id: result.taskId },
      data: {
        calendarEventId: result.providerEventId,
        calendarSyncedAt: new Date(),
        calendarSyncStatus: "SYNCED",
      },
    });
    return;
  }
  if (result.retryable) {
    // Retryable failure: keep the task in PENDING so the next drain
    // cycle (mobile foreground or stuck-task cron retry escalation)
    // picks it up again. Don't bump syncedAt — it tracks success only.
    await tx.task.update({
      where: { id: result.taskId },
      data: {
        calendarSyncStatus: "PENDING",
      },
    });
    return;
  }
  // Non-retryable failure: flip to FAILED. UI surfaces a per-task
  // retry button; tapping it clears the status and re-enqueues.
  await tx.task.update({
    where: { id: result.taskId },
    data: {
      calendarSyncStatus: "FAILED",
    },
  });
}

// ─── Executor interface + impls ─────────────────────────────────────

/**
 * Provider-agnostic executor. Implementations decide HOW the op
 * actually reaches the user's calendar — direct provider API call
 * (Phase B Google), forwarded-to-mobile (Phase A EventKit, Option
 * α), or no-op (tests).
 */
export interface CalendarSyncExecutor {
  execute(op: CalendarSyncOp): Promise<CalendarSyncOpResult>;
}

/**
 * NoopExecutor — pretends every op succeeded with a synthetic event
 * id. Used in unit tests and during slice C4-only soak before any
 * real executor exists.
 */
export class NoopExecutor implements CalendarSyncExecutor {
  async execute(op: CalendarSyncOp): Promise<CalendarSyncOpResult> {
    if (op.kind === "delete") {
      // Delete results in no event id remaining. Conventional shape:
      // ok=true with the prior providerEventId echoed back so the
      // caller can clear it.
      return {
        taskId: op.taskId,
        ok: true,
        providerEventId: op.providerEventId ?? "",
      };
    }
    return {
      taskId: op.taskId,
      ok: true,
      providerEventId:
        op.providerEventId ?? `noop-event-${op.taskId.slice(0, 8)}`,
    };
  }
}

/**
 * MobileQueueExecutor — Option α. Doesn't actually call any
 * calendar provider. The Task already has `calendarSyncStatus =
 * PENDING` (set by the API route that planned the op); mobile's
 * foreground hook will drain the queue, apply the op via
 * EventKit, and report back via the future
 * `/api/integrations/calendar/sync-result` endpoint (slice C5/C6).
 *
 * Why this is its own class instead of a no-op: it documents the
 * contract that "succeeded" here means "successfully enqueued",
 * not "successfully written to the calendar". The result it
 * returns is intentionally ambiguous on `providerEventId` — null-
 * ish — because the real id won't exist until mobile completes
 * the work.
 */
export class MobileQueueExecutor implements CalendarSyncExecutor {
  async execute(op: CalendarSyncOp): Promise<CalendarSyncOpResult> {
    // For deletes, mobile still has work to do (delete the
    // existing event). Same enqueue-only semantics. The terminal
    // state for delete is "task row removed from Acuity" plus
    // "event removed from calendar"; neither happens here.
    return {
      taskId: op.taskId,
      ok: true,
      // We DO NOT set a real eventId — mobile sets it on apply.
      // Returning the prior id (if any) preserves the pointer so
      // applySyncResult doesn't accidentally clear it.
      providerEventId: op.providerEventId ?? "",
    };
  }
}

// ─── Stuck-task escalation (cron-driven) ────────────────────────────

/**
 * Threshold beyond which a PENDING task is escalated to FAILED.
 * 24h covers the worst case of an inactive user who hasn't opened
 * mobile to flush the queue. After this window the user gets a
 * per-task retry button rather than a silently stuck task.
 */
export const PENDING_ESCALATION_MS = 24 * 60 * 60 * 1000;

/**
 * Escalate stale PENDING tasks to FAILED in batches.
 *
 * Pure-functional core for testability — given a list of (taskId,
 * pendingSinceMs) tuples and a current time, returns the taskIds
 * that should escalate. The Inngest function builds the input list
 * from a Prisma query and calls this; tests pass synthetic data.
 */
export function selectStuckTaskIds(
  pending: { id: string; calendarSyncedAt: Date | null; createdAt: Date }[],
  now: Date,
  thresholdMs = PENDING_ESCALATION_MS
): string[] {
  const cutoff = now.getTime() - thresholdMs;
  return pending
    .filter((t) => {
      // Use calendarSyncedAt if set (would be from a prior partial
      // success that re-entered PENDING); otherwise the row's own
      // createdAt as the start of the wait window.
      const since = t.calendarSyncedAt ?? t.createdAt;
      return since.getTime() < cutoff;
    })
    .map((t) => t.id);
}
