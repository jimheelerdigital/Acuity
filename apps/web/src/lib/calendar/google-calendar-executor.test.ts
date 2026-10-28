import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CalendarSyncOp } from "@/lib/calendar-sync";

import {
  classifyApiError,
  drainGoogleCalendarForUser,
  eventTimes,
  googleEventIdForTask,
  GoogleCalendarExecutor,
  isGoogleEventId,
} from "./google-calendar-executor";
import { encryptToken } from "./encryption";
import { GoogleAuthRevokedError } from "./google-direct";

process.env.NEXTAUTH_SECRET = "test-only-nextauth-secret";
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

type Call = { url: string; method: string; body: Record<string, unknown> | null; auth: string | null };

/** A fetch double that answers from a queue and records every call. */
function fakeFetch(responses: Array<{ status: number; body?: unknown }>) {
  const calls: Call[] = [];
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : null,
      auth: headers.Authorization ?? null,
    });
    const next = responses.shift();
    if (!next) throw new Error(`unexpected fetch ${init?.method} ${String(url)}`);
    const noBody = next.status === 204 || next.body === undefined;
    return new Response(noBody ? null : JSON.stringify(next.body), { status: next.status });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const apiError = (status: number, reason: string) => ({
  status,
  body: { error: { code: status, message: reason, errors: [{ reason }] } },
});

function op(over: Partial<CalendarSyncOp> = {}): CalendarSyncOp {
  return {
    taskId: "task_1",
    userId: "u1",
    kind: "upsert",
    providerEventId: null,
    providerId: "google",
    targetCalendarId: "primary",
    taskTitle: "Buy gift",
    dueDateISO: "2026-10-30T00:00:00.000Z",
    duration: "TIMED",
    ...over,
  };
}

function executor(fetchImpl: typeof fetch, getToken = vi.fn(async () => "tok")) {
  return { ex: new GoogleCalendarExecutor({ fetchImpl, getToken, timeZone: "America/New_York" }), getToken };
}

const EVENTS = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

describe("pure helpers", () => {
  it("derives a stable, valid Google event id from the task id", () => {
    const id = googleEventIdForTask("cm1abc");
    expect(id).toBe(googleEventIdForTask("cm1abc"));
    expect(id).not.toBe(googleEventIdForTask("cm1abd"));
    expect(isGoogleEventId(id)).toBe(true);
    expect(isGoogleEventId("ABCD-1234:EventKit")).toBe(false);
    expect(isGoogleEventId(null)).toBe(false);
  });

  it("reads the due day from the ISO string and places 9 AM in the person's timezone", () => {
    expect(eventTimes("2026-10-30T00:00:00.000Z", "TIMED", "America/Los_Angeles")).toEqual({
      start: { dateTime: "2026-10-30T09:00:00", timeZone: "America/Los_Angeles" },
      end: { dateTime: "2026-10-30T10:00:00", timeZone: "America/Los_Angeles" },
    });
  });

  it("all-day events end the next day, across month and year ends", () => {
    expect(eventTimes("2026-10-31T00:00:00.000Z", "ALL_DAY", "UTC")).toEqual({
      start: { date: "2026-10-31" },
      end: { date: "2026-11-01" },
    });
    expect(eventTimes("2026-12-31T00:00:00.000Z", "ALL_DAY", "UTC")?.end).toEqual({ date: "2027-01-01" });
  });

  it("classifies API errors", () => {
    expect(classifyApiError({ status: 401, reason: null, message: "" })).toBe("revoked");
    expect(classifyApiError({ status: 403, reason: "insufficientPermissions", message: "" })).toBe("revoked");
    expect(classifyApiError({ status: 403, reason: "rateLimitExceeded", message: "" })).toBe("retryable");
    expect(classifyApiError({ status: 403, reason: "forbidden", message: "" })).toBe("permanent");
    expect(classifyApiError({ status: 429, reason: null, message: "" })).toBe("retryable");
    expect(classifyApiError({ status: 503, reason: null, message: "" })).toBe("retryable");
    expect(classifyApiError({ status: 400, reason: "invalid", message: "" })).toBe("permanent");
  });
});

describe("GoogleCalendarExecutor", () => {
  it("creates a new event under the task's deterministic id", async () => {
    const f = fakeFetch([{ status: 200, body: { id: "x" } }]);
    const { ex } = executor(f.impl);
    const res = await ex.execute(op());
    const id = googleEventIdForTask("task_1");
    expect(res).toEqual({ taskId: "task_1", ok: true, providerEventId: id });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]).toMatchObject({ url: EVENTS, method: "POST", auth: "Bearer tok" });
    expect(f.calls[0].body).toMatchObject({
      id,
      summary: "Ripple: Buy gift",
      description: "Added by Ripple",
      status: "confirmed",
      start: { dateTime: "2026-10-30T09:00:00", timeZone: "America/New_York" },
      extendedProperties: { private: { rippleTaskId: "task_1" } },
    });
  });

  it("is idempotent: an insert that already exists (409) becomes an update, not a second event", async () => {
    const f = fakeFetch([apiError(409, "duplicate"), { status: 200, body: {} }]);
    const { ex } = executor(f.impl);
    const res = await ex.execute(op());
    const id = googleEventIdForTask("task_1");
    expect(res).toMatchObject({ ok: true, providerEventId: id });
    expect(f.calls.map((c) => c.method)).toEqual(["POST", "PATCH"]);
    expect(f.calls[1].url).toBe(`${EVENTS}/${id}`);
  });

  it("updates an existing event with PATCH, and recreates it if the person deleted it", async () => {
    const id = googleEventIdForTask("task_1");
    const ok = fakeFetch([{ status: 200, body: {} }]);
    expect(await executor(ok.impl).ex.execute(op({ providerEventId: id }))).toMatchObject({ ok: true, providerEventId: id });
    expect(ok.calls[0]).toMatchObject({ method: "PATCH", url: `${EVENTS}/${id}` });

    const gone = fakeFetch([apiError(404, "notFound"), { status: 200, body: {} }]);
    expect(await executor(gone.impl).ex.execute(op({ providerEventId: id }))).toMatchObject({ ok: true });
    expect(gone.calls.map((c) => c.method)).toEqual(["PATCH", "POST"]);
    expect(gone.calls[1].body?.id).toBe(id);
  });

  it("ignores a phone-calendar event id and writes under the Google id", async () => {
    const f = fakeFetch([{ status: 200, body: {} }]);
    const res = await executor(f.impl).ex.execute(op({ providerEventId: "E1:EventKit-ID" }));
    expect(res).toMatchObject({ ok: true, providerEventId: googleEventIdForTask("task_1") });
    expect(f.calls[0].method).toBe("POST");
  });

  it("completing only marks the title ✓ and never moves the event", async () => {
    const id = googleEventIdForTask("task_1");
    const f = fakeFetch([{ status: 200, body: {} }]);
    await executor(f.impl).ex.execute(op({ kind: "complete", providerEventId: id }));
    expect(f.calls[0].method).toBe("PATCH");
    expect(f.calls[0].body).toEqual({ summary: "✓ Ripple: Buy gift" });
  });

  it("deletes, treating an already-gone event as done", async () => {
    const id = googleEventIdForTask("task_1");
    const f = fakeFetch([{ status: 204 }]);
    const del = op({ kind: "delete", taskId: "calendar-deletion:d1", providerEventId: id });
    expect(await executor(f.impl).ex.execute(del)).toMatchObject({ ok: true });
    expect(f.calls[0]).toMatchObject({ method: "DELETE", url: `${EVENTS}/${id}` });

    const g = fakeFetch([apiError(410, "deleted")]);
    expect(await executor(g.impl).ex.execute(del)).toMatchObject({ ok: true });

    const none = fakeFetch([]);
    expect(await executor(none.impl).ex.execute({ ...del, providerEventId: "phone:1" })).toMatchObject({ ok: true });
    expect(none.calls).toHaveLength(0);
  });

  it("refreshes the access token once on a 401, then succeeds", async () => {
    const f = fakeFetch([{ status: 401, body: {} }, { status: 200, body: {} }]);
    const getToken = vi.fn(async (o?: { forceRefresh?: boolean }) => (o?.forceRefresh ? "fresh" : "stale"));
    const res = await executor(f.impl, getToken).ex.execute(op());
    expect(res.ok).toBe(true);
    expect(getToken).toHaveBeenLastCalledWith({ forceRefresh: true });
    expect(f.calls.map((c) => c.auth)).toEqual(["Bearer stale", "Bearer fresh"]);
  });

  it("throws GoogleAuthRevokedError on a 401 after refresh, and on a removed scope", async () => {
    const f = fakeFetch([{ status: 401, body: {} }, { status: 401, body: {} }]);
    await expect(executor(f.impl).ex.execute(op())).rejects.toBeInstanceOf(GoogleAuthRevokedError);
    const g = fakeFetch([apiError(403, "insufficientPermissions")]);
    await expect(executor(g.impl).ex.execute(op())).rejects.toBeInstanceOf(GoogleAuthRevokedError);
  });

  it("propagates a revoked token from the token provider", async () => {
    const f = fakeFetch([]);
    const getToken = vi.fn(async () => {
      throw new GoogleAuthRevokedError("invalid_grant");
    });
    await expect(executor(f.impl, getToken).ex.execute(op())).rejects.toBeInstanceOf(GoogleAuthRevokedError);
  });

  it("maps rate limits / 5xx / network errors to retryable and bad requests to permanent", async () => {
    expect(await executor(fakeFetch([apiError(403, "rateLimitExceeded")]).impl).ex.execute(op())).toMatchObject({
      ok: false,
      retryable: true,
    });
    expect(await executor(fakeFetch([{ status: 503, body: {} }]).impl).ex.execute(op())).toMatchObject({
      ok: false,
      retryable: true,
    });
    expect(await executor(fakeFetch([apiError(400, "invalid")]).impl).ex.execute(op())).toMatchObject({
      ok: false,
      retryable: false,
    });
    const boom = vi.fn(async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    expect(await executor(boom).ex.execute(op())).toMatchObject({ ok: false, retryable: true, reason: "ECONNRESET" });
  });

  it("a task without a due date can't become an event", async () => {
    const f = fakeFetch([]);
    expect(await executor(f.impl).ex.execute(op({ dueDateISO: null }))).toEqual({
      taskId: "task_1",
      ok: false,
      retryable: false,
      reason: "no_due_date",
    });
  });
});

describe("drainGoogleCalendarForUser", () => {
  const pendingSince = new Date("2026-10-28T10:00:00Z");
  let db: ReturnType<typeof makeDb>;

  function makeDb(provider: string | null = "google") {
    return {
      user: {
        findUnique: vi.fn(async () => ({
          calendarConnectedProvider: provider,
          targetCalendarId: "primary",
          defaultEventDuration: "TIMED",
          timezone: "America/New_York",
        })),
        update: vi.fn(async () => ({})),
      },
      task: {
        findMany: vi.fn(async () => [
          { id: "task_1", title: "Buy gift", text: "Buy gift", status: "OPEN", dueDate: new Date("2026-10-30T00:00:00Z"), calendarEventId: null, calendarPendingSince: pendingSince },
          { id: "task_2", title: "Call mom", text: "Call mom", status: "OPEN", dueDate: new Date("2026-10-31T00:00:00Z"), calendarEventId: null, calendarPendingSince: pendingSince },
        ]),
        update: vi.fn(async () => ({})),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      calendarDeletion: {
        findMany: vi.fn(async () => [{ id: "d1", providerEventId: googleEventIdForTask("old_task") }]),
        findFirst: vi.fn(async () => ({ id: "d1", attempts: 0 })),
        deleteMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async () => ({})),
      },
      calendarConnection: {
        findUnique: vi.fn(async () => ({
          id: "conn_1",
          accessToken: encryptToken("cached-access"),
          refreshToken: encryptToken("refresh-1"),
          tokenExpiresAt: new Date(Date.now() + 30 * 60_000),
        })),
        update: vi.fn(async () => ({})),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    };
  }

  beforeEach(() => {
    db = makeDb();
  });

  it("removes queued deletions, then writes PENDING tasks, recording results guarded on calendarPendingSince", async () => {
    const f = fakeFetch([{ status: 204 }, { status: 200, body: {} }, { status: 200, body: {} }]);
    const summary = await drainGoogleCalendarForUser(db as never, "u1", { fetchImpl: f.impl });
    expect(summary).toEqual({ synced: 2, failed: 0, retrying: 0, deleted: 1 });
    expect(f.calls.map((c) => c.method)).toEqual(["DELETE", "POST", "POST"]);
    expect(f.calls[1].auth).toBe("Bearer cached-access");
    expect(db.calendarDeletion.deleteMany).toHaveBeenCalledWith({ where: { id: "d1" } });
    expect(db.task.updateMany).toHaveBeenCalledWith({
      where: { id: "task_1", calendarPendingSince: pendingSince },
      data: expect.objectContaining({ calendarSyncStatus: "SYNCED", calendarEventId: googleEventIdForTask("task_1") }),
    });
  });

  it("keeps a task PENDING when it was edited while the write was in flight", async () => {
    db.task.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValue({ count: 1 });
    db.task.findMany.mockResolvedValueOnce([
      { id: "task_1", title: "Buy gift", text: "Buy gift", status: "OPEN", dueDate: new Date("2026-10-30T00:00:00Z"), calendarEventId: null, calendarPendingSince: pendingSince },
    ]);
    db.calendarDeletion.findMany.mockResolvedValueOnce([]);
    const f = fakeFetch([{ status: 200, body: {} }]);
    await drainGoogleCalendarForUser(db as never, "u1", { fetchImpl: f.impl });
    expect(db.task.updateMany).toHaveBeenLastCalledWith({
      where: { id: "task_1" },
      data: { calendarEventId: googleEventIdForTask("task_1") },
    });
  });

  it("disconnects when Google revoked access: tokens wiped, queue released, nothing escalates", async () => {
    db.calendarConnection.findUnique.mockResolvedValue({
      id: "conn_1",
      accessToken: null,
      refreshToken: encryptToken("refresh-1"),
      tokenExpiresAt: null,
    } as never);
    // Token refresh answers invalid_grant.
    const f = fakeFetch([{ status: 400, body: { error: "invalid_grant" } }]);
    const summary = await drainGoogleCalendarForUser(db as never, "u1", { fetchImpl: f.impl });
    expect(summary).toMatchObject({ revoked: true, reason: "invalid_grant" });
    expect(f.calls[0].url).toBe("https://oauth2.googleapis.com/token");
    expect(db.calendarConnection.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", provider: "google" },
      data: expect.objectContaining({ accessToken: null, refreshToken: null, lastError: "revoked:invalid_grant" }),
    });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { calendarConnectedProvider: null, calendarConnectedAt: null, targetCalendarId: null },
    });
    expect(db.task.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", calendarSyncStatus: "PENDING" },
      data: { calendarSyncStatus: "NOT_SYNCED", calendarPendingSince: null },
    });
    expect(db.calendarDeletion.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });

  it("does nothing for someone not connected to Google", async () => {
    db = makeDb("ios_eventkit");
    const f = fakeFetch([]);
    expect(await drainGoogleCalendarForUser(db as never, "u1", { fetchImpl: f.impl })).toEqual({ skipped: "not_connected" });
    expect(f.calls).toHaveLength(0);
  });
});
