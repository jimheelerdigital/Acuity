/**
 * Server-side executor for the "google" calendar provider (2026-10-28).
 *
 * Same queue as the phone providers: the planner (lib/calendar-sync.ts)
 * marks Task.calendarSyncStatus = PENDING, dismissals add a
 * CalendarDeletion row. For a Google-connected person the server drains
 * that queue itself (Inngest: calendar/google.drain-requested, debounced
 * per user, plus the 30-min calendar cron as a retry sweep) instead of
 * waiting for a phone, through the CalendarSyncExecutor interface the
 * engine already defines. Results are applied with the same
 * applySyncResult / applyDeletionResult the phone's /sync-result uses.
 *
 * Idempotency: every task maps to a deterministic Google event id derived
 * from the task id. Inserting an event that already exists returns 409 and
 * becomes an update, so a retried or duplicated op never creates a second
 * event. Updates use PATCH so fields the person changed in Google that we
 * don't own (reminders, colour, attendees) survive.
 *
 * Event shape mirrors the phone (apps/mobile/lib/calendar-op.ts):
 * "Ripple: <task>", "✓ Ripple: <task>" once done, timed 9-10 AM in the
 * person's timezone or all-day, per User.defaultEventDuration.
 */

import { createHash } from "crypto";

import type { PrismaClient } from "@prisma/client";

import {
  applyDeletionResult,
  DELETION_DRAIN_BATCH,
  deletionOps,
  parseDeletionOpId,
} from "@/lib/calendar-deletion";
import {
  applySyncResult,
  queuedTaskOp,
  type CalendarSyncExecutor,
  type CalendarSyncOp,
  type CalendarSyncOpResult,
} from "@/lib/calendar-sync";
import {
  getGoogleAccessToken,
  GOOGLE_PROVIDER,
  GOOGLE_TARGET_CALENDAR,
  GoogleAuthRevokedError,
  markGoogleDisconnected,
  type FetchLike,
} from "@/lib/calendar/google-direct";

const API_BASE = "https://www.googleapis.com/calendar/v3";
export const GOOGLE_DRAIN_BATCH = 100;
/** Timed task events start at this local hour and last an hour (= phone). */
export const TIMED_START_HOUR = 9;

// ─── Pure helpers ───────────────────────────────────────────────────

/**
 * Google event ids must be 5-1024 chars of base32hex (a-v, 0-9). "ripple"
 * plus a sha256 hex digest of the task id fits and is stable per task.
 */
export function googleEventIdForTask(taskId: string): string {
  return `ripple${createHash("sha256").update(taskId).digest("hex").slice(0, 40)}`;
}

/** Ids from a phone calendar (EventKit / Android) aren't valid Google ids. */
export function isGoogleEventId(id: string | null | undefined): id is string {
  return typeof id === "string" && /^[a-v0-9]{5,1024}$/.test(id);
}

export function eventTitle(taskTitle: string, done: boolean): string {
  return `${done ? "✓ " : ""}Ripple: ${taskTitle}`;
}

type GoogleEventTime = { date: string } | { dateTime: string; timeZone: string };

/**
 * Due dates are calendar days stored as midnight UTC. Read the day from
 * the ISO string itself (never through a timezone conversion, which would
 * put US users' tasks a day early), then let Google place 9 AM in the
 * person's own timezone.
 */
export function eventTimes(
  dueDateISO: string,
  duration: "ALL_DAY" | "TIMED",
  timeZone: string
): { start: GoogleEventTime; end: GoogleEventTime } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dueDateISO);
  if (!m) return null;
  const day = `${m[1]}-${m[2]}-${m[3]}`;
  if (duration === "ALL_DAY") {
    const next = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1));
    return { start: { date: day }, end: { date: next.toISOString().slice(0, 10) } };
  }
  const hh = (h: number) => String(h).padStart(2, "0");
  return {
    start: { dateTime: `${day}T${hh(TIMED_START_HOUR)}:00:00`, timeZone },
    end: { dateTime: `${day}T${hh(TIMED_START_HOUR + 1)}:00:00`, timeZone },
  };
}

export function eventBody(op: CalendarSyncOp, timeZone: string): Record<string, unknown> | null {
  if (!op.dueDateISO) return null;
  const times = eventTimes(op.dueDateISO, op.duration, timeZone);
  if (!times) return null;
  return {
    summary: eventTitle(op.taskTitle, op.kind === "complete"),
    description: "Added by Ripple",
    ...times,
    // Restores an event the person deleted in Google if the task changes
    // again (same as the phone, which recreates a missing event).
    status: "confirmed",
    extendedProperties: { private: { rippleTaskId: op.taskId } },
  };
}

type ApiError = { status: number; reason: string | null; message: string };

/** What a failed Calendar API call means for the op. */
export function classifyApiError(err: ApiError): "revoked" | "retryable" | "permanent" {
  if (err.status === 401) return "revoked";
  if (err.status === 403) {
    if (err.reason === "insufficientPermissions" || err.reason === "authError") return "revoked";
    if (
      err.reason === "rateLimitExceeded" ||
      err.reason === "userRateLimitExceeded" ||
      err.reason === "quotaExceeded"
    ) {
      return "retryable";
    }
    return "permanent"; // e.g. a read-only calendar
  }
  if (err.status === 408 || err.status === 429 || err.status >= 500) return "retryable";
  return "permanent";
}

// ─── Executor ───────────────────────────────────────────────────────

export type AccessTokenProvider = (opts?: { forceRefresh?: boolean }) => Promise<string>;

class GoogleApiError extends Error {
  constructor(public readonly info: ApiError) {
    super(`google_calendar_${info.status}${info.reason ? `_${info.reason}` : ""}`);
  }
}

/**
 * Executes ops against the Google Calendar API. Throws
 * GoogleAuthRevokedError when the grant is dead (the caller disconnects);
 * every other failure comes back as a CalendarSyncOpResult.
 */
export class GoogleCalendarExecutor implements CalendarSyncExecutor {
  private readonly fetchImpl: FetchLike;
  private readonly getToken: AccessTokenProvider;
  private readonly timeZone: string;

  constructor(deps: { getToken: AccessTokenProvider; fetchImpl?: FetchLike; timeZone: string }) {
    this.getToken = deps.getToken;
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.timeZone = deps.timeZone;
  }

  private async call(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown
  ): Promise<{ status: number; json: Record<string, unknown> | null }> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.getToken(attempt === 0 ? {} : { forceRefresh: true });
      const res = await this.fetchImpl(`${API_BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      // A 401 with a cached token may just be an early expiry: refresh once.
      if (res.status === 401 && attempt === 0) continue;
      const text = await res.text().catch(() => "");
      let json: Record<string, unknown> | null = null;
      try {
        json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
      } catch {
        json = null;
      }
      return { status: res.status, json };
    }
    return { status: 401, json: null }; // unreachable; loop always returns
  }

  private async request(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown
  ): Promise<{ status: number; json: Record<string, unknown> | null }> {
    const res = await this.call(method, path, body);
    if (res.status >= 200 && res.status < 300) return res;
    const error = (res.json?.error ?? null) as {
      message?: string;
      errors?: Array<{ reason?: string }>;
    } | null;
    throw new GoogleApiError({
      status: res.status,
      reason: error?.errors?.[0]?.reason ?? null,
      message: (error?.message ?? "").slice(0, 200),
    });
  }

  private eventsPath(calendarId: string, eventId?: string): string {
    const base = `/calendars/${encodeURIComponent(calendarId)}/events`;
    return eventId ? `${base}/${encodeURIComponent(eventId)}` : base;
  }

  /** Insert with our deterministic id; an existing one (409) is updated instead. */
  private async insertOrUpdate(calendarId: string, eventId: string, body: Record<string, unknown>) {
    try {
      await this.request("POST", this.eventsPath(calendarId), { id: eventId, ...body });
    } catch (err) {
      if (err instanceof GoogleApiError && err.info.status === 409) {
        await this.request("PATCH", this.eventsPath(calendarId, eventId), body);
        return;
      }
      throw err;
    }
  }

  async execute(op: CalendarSyncOp): Promise<CalendarSyncOpResult> {
    const calendarId = op.targetCalendarId || GOOGLE_TARGET_CALENDAR;
    try {
      if (op.kind === "delete") {
        // A phone-calendar id has nothing on Google to remove.
        if (isGoogleEventId(op.providerEventId)) {
          try {
            await this.request("DELETE", this.eventsPath(calendarId, op.providerEventId));
          } catch (err) {
            // Already gone (404) or already deleted (410): that's the goal.
            if (!(err instanceof GoogleApiError && (err.info.status === 404 || err.info.status === 410))) {
              throw err;
            }
          }
        }
        return { taskId: op.taskId, ok: true, providerEventId: op.providerEventId ?? "" };
      }

      const existingId = isGoogleEventId(op.providerEventId) ? op.providerEventId : null;
      const eventId = existingId ?? googleEventIdForTask(op.taskId);

      // Checking a task off only marks its event ✓; it never moves it (the
      // person may have dragged it to another time in Google).
      if (op.kind === "complete" && existingId) {
        try {
          await this.request("PATCH", this.eventsPath(calendarId, existingId), {
            summary: eventTitle(op.taskTitle, true),
          });
          return { taskId: op.taskId, ok: true, providerEventId: existingId };
        } catch (err) {
          if (!(err instanceof GoogleApiError && (err.info.status === 404 || err.info.status === 410))) {
            throw err;
          }
          // Event gone: fall through to a full write below.
        }
      }

      const body = eventBody(op, this.timeZone);
      if (!body) {
        return { taskId: op.taskId, ok: false, retryable: false, reason: "no_due_date" };
      }

      if (existingId) {
        try {
          await this.request("PATCH", this.eventsPath(calendarId, existingId), body);
          return { taskId: op.taskId, ok: true, providerEventId: existingId };
        } catch (err) {
          if (!(err instanceof GoogleApiError && (err.info.status === 404 || err.info.status === 410))) {
            throw err;
          }
        }
      }
      await this.insertOrUpdate(calendarId, eventId, body);
      return { taskId: op.taskId, ok: true, providerEventId: eventId };
    } catch (err) {
      if (err instanceof GoogleAuthRevokedError) throw err;
      if (err instanceof GoogleApiError) {
        const kind = classifyApiError(err.info);
        if (kind === "revoked") {
          throw new GoogleAuthRevokedError(err.info.reason ?? `http_${err.info.status}`);
        }
        const reason = `${err.message}${err.info.message ? `: ${err.info.message}` : ""}`.slice(0, 300);
        return kind === "retryable"
          ? { taskId: op.taskId, ok: false, retryable: true, reason }
          : { taskId: op.taskId, ok: false, retryable: false, reason };
      }
      // Network / token-endpoint hiccup: try again next drain.
      const reason = err instanceof Error ? err.message.slice(0, 300) : "unknown";
      return { taskId: op.taskId, ok: false, retryable: true, reason };
    }
  }
}

// ─── Drain ──────────────────────────────────────────────────────────

type DrainDb = Pick<PrismaClient, "user" | "task" | "calendarDeletion" | "calendarConnection">;

export type GoogleDrainSummary =
  | { skipped: "not_connected" }
  | { revoked: true; reason: string; synced: number; failed: number; deleted: number }
  | { synced: number; failed: number; retrying: number; deleted: number };

/**
 * Run one person's queued Google ops: queued deletions first, then PENDING
 * tasks (oldest first). Caller has already checked the feature flag and the
 * entitlement. A dead grant stops the run and disconnects (tasks go back
 * to NOT_SYNCED, see markGoogleDisconnected).
 */
export async function drainGoogleCalendarForUser(
  db: DrainDb,
  userId: string,
  deps: { fetchImpl?: FetchLike; now?: Date } = {}
): Promise<GoogleDrainSummary> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      calendarConnectedProvider: true,
      targetCalendarId: true,
      defaultEventDuration: true,
      timezone: true,
    },
  });
  if (!user || user.calendarConnectedProvider !== GOOGLE_PROVIDER) {
    return { skipped: "not_connected" };
  }
  const targetCalendarId = user.targetCalendarId || GOOGLE_TARGET_CALENDAR;

  const [deletions, tasks] = await Promise.all([
    db.calendarDeletion.findMany({
      where: { userId },
      select: { id: true, providerEventId: true },
      orderBy: { createdAt: "asc" },
      take: DELETION_DRAIN_BATCH,
    }),
    db.task.findMany({
      where: { userId, calendarSyncStatus: "PENDING" },
      select: {
        id: true,
        title: true,
        text: true,
        status: true,
        dueDate: true,
        calendarEventId: true,
        calendarPendingSince: true,
      },
      orderBy: { createdAt: "asc" },
      take: GOOGLE_DRAIN_BATCH,
    }),
  ]);

  const executor = new GoogleCalendarExecutor({
    timeZone: user.timezone || "America/Chicago",
    fetchImpl: deps.fetchImpl,
    getToken: (o) =>
      getGoogleAccessToken(db, userId, { fetchImpl: deps.fetchImpl, now: deps.now, forceRefresh: o?.forceRefresh }),
  });

  let synced = 0;
  let failed = 0;
  let retrying = 0;
  let deleted = 0;
  try {
    for (const op of deletionOps(deletions, { userId, providerId: GOOGLE_PROVIDER, targetCalendarId })) {
      const result = await executor.execute(op);
      const deletionId = parseDeletionOpId(op.taskId);
      if (!deletionId) continue;
      await applyDeletionResult(
        db,
        userId,
        deletionId,
        result.ok ? { ok: true } : { ok: false, retryable: result.retryable, reason: result.reason }
      );
      if (result.ok) deleted++;
    }

    for (const t of tasks) {
      const op = queuedTaskOp(t, {
        userId,
        providerId: GOOGLE_PROVIDER,
        targetCalendarId,
        defaultEventDuration: user.defaultEventDuration,
      });
      const result = await executor.execute(op);
      try {
        // Guarded on calendarPendingSince: if the task was edited (and
        // re-queued) while this call was in flight, keep it PENDING so the
        // follow-up run writes the edit.
        await applySyncResult(db, result, { expectedPendingSince: t.calendarPendingSince });
      } catch {
        // Task deleted mid-run (P2025). Nothing to record.
      }
      if (result.ok) synced++;
      else if (result.retryable) retrying++;
      else failed++;
    }
  } catch (err) {
    if (err instanceof GoogleAuthRevokedError) {
      await markGoogleDisconnected(db, userId, err.reason);
      return { revoked: true, reason: err.reason, synced, failed, deleted };
    }
    throw err;
  }
  return { synced, failed, retrying, deleted };
}
